"""
Custom Checks API — manage and view per-server service check status.

Endpoints:
- GET  /api/checks               — Get all custom check results
- GET  /api/checks/{server}      — Get custom check results for a server
- POST /api/checks/{server}/run  — Trigger an immediate check run for a server
- GET  /api/checks/summary       — Get aggregate check status summary
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import CustomCheckResult, ServerChecksResponse
from app.services.custom_checks import custom_check_runner
from app.api.servers import get_servers_dict

router = APIRouter(prefix="/api/checks", tags=["custom-checks"])


def _collect_server_checks() -> dict[str, list]:
    """Build the checks_per_server dict from all registered servers."""
    servers_dict = get_servers_dict()
    checks_map: dict[str, list] = {}
    for server_id, srv in servers_dict.items():
        if srv.custom_checks:
            checks_map[server_id] = srv.custom_checks
    return checks_map


@router.get("")
async def get_all_check_results(
    status: Optional[str] = Query(default=None, description="Filter by status (online|offline|degraded|unknown)"),
):
    """Get the latest results for all custom checks across all servers."""
    results = custom_check_runner.get_latest_results()

    if status:
        results = [r for r in results if r.status == status]

    return {
        "checks": [r.model_dump() for r in results],
        "total": len(results),
        "filtered_by_status": status,
    }


@router.get("/summary")
async def get_check_summary():
    """Get aggregate summary of all custom check results."""
    servers_dict = get_servers_dict()
    total_configured = sum(1 for s in servers_dict.values() if s.custom_checks)
    total_checks = sum(len(s.custom_checks) for s in servers_dict.values())
    return {
        "servers_with_checks": total_configured,
        "total_checks_configured": total_checks,
        "runner_summary": custom_check_runner.get_summary(),
    }


@router.get("/{server}", response_model=ServerChecksResponse)
async def get_server_check_results(server: str):
    """Get the latest custom check results for a specific server."""
    servers_dict = get_servers_dict()
    if server not in servers_dict:
        raise HTTPException(status_code=404, detail=f"Server '{server}' not found")

    results = custom_check_runner.get_latest_results(server_id=server)
    return ServerChecksResponse(
        server=server,
        checks=results,
        total=len(results),
    )


@router.post("/{server}/run")
async def run_server_checks(server: str):
    """
    Trigger an immediate custom check run for a specific server.

    Runs all configured checks for the server and returns the results.
    Useful for on-demand troubleshooting.
    """
    servers_dict = get_servers_dict()
    if server not in servers_dict:
        raise HTTPException(status_code=404, detail=f"Server '{server}' not found")

    srv = servers_dict[server]
    if not srv.custom_checks:
        return {
            "server": server,
            "message": "No custom checks configured for this server",
            "checks": [],
            "total": 0,
        }

    # Re-use the runner synchronously (it uses asyncio internally)
    import asyncio
    results = await custom_check_runner.run_all({server: srv.custom_checks})

    return {
        "server": server,
        "checks": [r.model_dump() for r in results],
        "total": len(results),
    }
