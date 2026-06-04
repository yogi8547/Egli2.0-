"""
Custom Checks Runner — monitors application-level services like Tomcat, OpenSIP,
and arbitrary TCP ports/HTTP endpoints, feeding results into the alert system.

Supported check types:
- tcp_port: Opens a raw TCP connection to host:port, checks if it accepts
- http:     HTTP GET to a URL, validates response status code
- process:  SSH into server, checks if process is running (future)
- custom_snmp: Poll a custom OID against a threshold (future)
- script:   Run arbitrary command and check exit code (future)

Usage:
    from app.services.custom_checks import custom_check_runner
    results = await custom_check_runner.run_all(checks_dict)
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Optional

import httpx
from loguru import logger

from app.config import settings
from app.models.schemas import CustomCheckConfig, CustomCheckResult


class CustomCheckRunner:
    """
    Executes custom service checks (TCP port, HTTP health) and returns results.

    Maintains a semaphore for concurrency control and logs all check results.
    Checks are stateless — each run re-evaluates from scratch.
    """

    def __init__(self) -> None:
        self._semaphore = asyncio.Semaphore(settings.check_concurrency)
        # Latest results keyed by "server_id:check_name"
        self._latest_results: dict[str, CustomCheckResult] = {}

    async def run_all(self, checks_per_server: dict[str, list[CustomCheckConfig]]) -> list[CustomCheckResult]:
        """
        Run all custom checks for all servers concurrently (with semaphore).

        Args:
            checks_per_server: Mapping of server_id -> list of check configs

        Returns:
            Flat list of all check results
        """
        tasks: list[asyncio.Task] = []
        for server_id, checks in checks_per_server.items():
            for check in checks:
                tasks.append(
                    asyncio.create_task(self._run_single(server_id, check))
                )

        if not tasks:
            return []

        results = await asyncio.gather(*tasks, return_exceptions=True)

        flat_results: list[CustomCheckResult] = []
        for r in results:
            if isinstance(r, Exception):
                logger.error("Custom check task failed: {}", r)
            elif isinstance(r, CustomCheckResult):
                flat_results.append(r)
                self._latest_results[f"{r.server}:{r.name}"] = r
            else:
                flat_results.append(r)

        return flat_results

    async def _run_single(self, server_id: str, check: CustomCheckConfig) -> CustomCheckResult:
        """
        Execute a single check with timeout and concurrency control.
        Dispatches to the appropriate check method based on check_type.
        """
        async with self._semaphore:
            target = check.target or server_id
            start = time.monotonic()

            try:
                if check.check_type == "tcp_port":
                    result = await self._check_tcp_port(server_id, check, target)
                elif check.check_type == "http":
                    result = await self._check_http(server_id, check, target)
                elif check.check_type == "process":
                    result = await self._check_process(server_id, check, target)
                elif check.check_type == "custom_snmp":
                    result = await self._check_custom_snmp(server_id, check, target)
                else:
                    result = CustomCheckResult(
                        name=check.name,
                        check_type=check.check_type,
                        server=server_id,
                        success=False,
                        status="offline",
                        message=f"Unknown check type: {check.check_type}",
                        response_time_ms=0.0,
                        timestamp=datetime.utcnow().isoformat(),
                        error=f"Unsupported check_type '{check.check_type}'",
                    )

                result.response_time_ms = round((time.monotonic() - start) * 1000, 1)
                return result

            except asyncio.TimeoutError:
                elapsed = (time.monotonic() - start) * 1000
                return CustomCheckResult(
                    name=check.name,
                    check_type=check.check_type,
                    server=server_id,
                    success=False,
                    status="offline",
                    message=f"Check timed out after {check.timeout_seconds}s",
                    response_time_ms=round(elapsed, 1),
                    timestamp=datetime.utcnow().isoformat(),
                    error="Timeout",
                )
            except Exception as exc:
                elapsed = (time.monotonic() - start) * 1000
                return CustomCheckResult(
                    name=check.name,
                    check_type=check.check_type,
                    server=server_id,
                    success=False,
                    status="offline",
                    message=str(exc),
                    response_time_ms=round(elapsed, 1),
                    timestamp=datetime.utcnow().isoformat(),
                    error=str(exc),
                )

    # ── TCP Port Check ───────────────────────────────────────────────────

    async def _check_tcp_port(self, server_id: str, check: CustomCheckConfig, target: str) -> CustomCheckResult:
        """
        Open a raw TCP connection to target:port and see if it accepts.
        Used for monitoring services like Tomcat (8080), OpenSIP (5060),
        MySQL (3306), etc.
        """
        port = check.port
        if not port:
            return CustomCheckResult(
                name=check.name, check_type="tcp_port", server=server_id,
                success=False, status="offline",
                message="TCP port check requires a 'port' to be configured",
                error="Missing port",
            )

        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(target, port),
                timeout=check.timeout_seconds,
            )
            writer.close()
            await writer.wait_closed()

            return CustomCheckResult(
                name=check.name,
                check_type="tcp_port",
                server=server_id,
                success=True,
                status="online",
                value=float(port),
                message=f"TCP port {port} is open on {target}",
            )
        except (ConnectionRefusedError, OSError) as exc:
            return CustomCheckResult(
                name=check.name, check_type="tcp_port", server=server_id,
                success=False, status="offline",
                message=f"TCP port {port} is not reachable on {target}",
                error=str(exc),
            )

    # ── HTTP Health Check ────────────────────────────────────────────────

    async def _check_http(self, server_id: str, check: CustomCheckConfig, target: str) -> CustomCheckResult:
        """
        Perform an HTTP GET to the configured URL and validate the response
        status code. Useful for Tomcat manager health endpoints, REST APIs,
        or any application-level health check.

        The URL should be fully qualified (e.g. http://host:8080/health).
        If only a path is given, it's prefixed with http://{target}.
        """
        url = check.url or f"http://{target}:{check.port or 80}/health"
        expected = check.expect_status or 200

        try:
            async with httpx.AsyncClient(timeout=check.timeout_seconds) as client:
                resp = await client.get(url)
                is_healthy = resp.status_code == expected

                return CustomCheckResult(
                    name=check.name,
                    check_type="http",
                    server=server_id,
                    success=is_healthy,
                    status="online" if is_healthy else "degraded",
                    value=float(resp.status_code),
                    message=f"HTTP GET {url} -> {resp.status_code}" + (" (expected)" if is_healthy else f" (expected {expected})"),
                    error=None if is_healthy else f"Status {resp.status_code} != expected {expected}",
                )
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError) as exc:
            return CustomCheckResult(
                name=check.name, check_type="http", server=server_id,
                success=False, status="offline",
                message=f"HTTP request to {url} failed",
                error=str(exc),
            )

    # ── Process Check (stub) ──────────────────────────────────────────────

    async def _check_process(self, server_id: str, check: CustomCheckConfig, target: str) -> CustomCheckResult:
        """
        Stub: Would SSH into the server and check if a process is running.
        Returns success=True to avoid triggering false alerts until implemented.
        """
        return CustomCheckResult(
            name=check.name,
            check_type="process",
            server=server_id,
            success=True,
            status="unknown",
            message=f"Process check for '{check.process_name}' on {target} — not yet implemented (requires SSH agent)",
            error="Not implemented",
        )

    # ── Custom SNMP Check (stub) ─────────────────────────────────────────

    async def _check_custom_snmp(self, server_id: str, check: CustomCheckConfig, target: str) -> CustomCheckResult:
        """
        Stub: Would poll a custom OID via SNMP and compare against thresholds.
        Returns success=True to avoid triggering false alerts until implemented.
        """
        return CustomCheckResult(
            name=check.name,
            check_type="custom_snmp",
            server=server_id,
            success=True,
            status="unknown",
            message=f"Custom SNMP check for OID '{check.oid}' on {target} — not yet implemented (requires easysnmp)",
            error="Not implemented",
        )

    # ── Results Access ───────────────────────────────────────────────────

    def get_latest_results(self, server_id: Optional[str] = None) -> list[CustomCheckResult]:
        """Get the latest results for all checks, optionally filtered by server."""
        if server_id:
            prefix = f"{server_id}:"
            return [
                r for key, r in self._latest_results.items()
                if key.startswith(prefix)
            ]
        return list(self._latest_results.values())

    def get_latest_for_check(self, server_id: str, check_name: str) -> Optional[CustomCheckResult]:
        """Get the latest result for a specific check by server + name."""
        return self._latest_results.get(f"{server_id}:{check_name}")

    def get_summary(self) -> dict:
        """Get a summary of all custom check results."""
        results = self._latest_results.values()
        total = len(results)
        online = sum(1 for r in results if r.status == "online")
        offline = sum(1 for r in results if r.status == "offline")
        degraded = sum(1 for r in results if r.status == "degraded")
        unknown = sum(1 for r in results if r.status == "unknown")
        return {
            "total_checks": total,
            "online": online,
            "offline": offline,
            "degraded": degraded,
            "unknown": unknown,
            "by_type": {
                check_type: sum(1 for r in results if r.check_type == check_type)
                for check_type in set(r.check_type for r in results)
            },
        }


# Singleton runner
custom_check_runner = CustomCheckRunner()
