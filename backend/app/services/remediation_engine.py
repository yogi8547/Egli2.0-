"""
Remediation Engine — automatically responds to active alerts with
predefined or AI-generated remediation actions.

Features:
- Predefined remediation recipes for common issues (high CPU, disk full, etc.)
- Action execution simulation (or real SSH commands in production)
- Safety cooldowns to prevent repeated actions
- Full audit trail of all remediation actions
- Configurable auto-remediation policies

Usage:
    from app.services.remediation_engine import remediation_engine
    actions = await remediation_engine.evaluate_and_remediate(alerts)
"""

from __future__ import annotations

import asyncio
import shlex
import subprocess
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional

from loguru import logger

from app.config import settings
from app.models.schemas import Alert, AlertSeverity, AlertStatus


class RemediationAction(str, Enum):
    """Types of remediation actions the engine can perform."""
    KILL_TOP_CPU = "kill_top_cpu_process"
    CLEAN_TEMP_FILES = "clean_temp_files"
    COMPRESS_LOGS = "compress_logs"
    RESTART_SERVICE = "restart_service"
    CLEAR_CACHE = "clear_cache"
    NOTIFY_ONLY = "notify_only"


class RemediationStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"  # Cooldown or policy prevented execution


REMEDIATION_RECIPES = {
    "cpu": {
        RemediationAction.KILL_TOP_CPU: {
            "condition": lambda a: a.severity == AlertSeverity.CRITICAL,
            "command": 'ps -eo pid,%cpu,comm --sort=-%cpu | head -2 | tail -1 | awk "{print $1}" | xargs -r kill -9',
            "description": "Kill the process consuming the most CPU",
            "cooldown_minutes": 10,
            "risk": "high",  # Could kill critical processes
        },
        RemediationAction.NOTIFY_ONLY: {
            "condition": lambda a: True,  # Always fallback to notify
            "command": None,
            "description": "Notify administrator of high CPU",
            "cooldown_minutes": 5,
            "risk": "none",
        },
    },
    "memory": {
        RemediationAction.CLEAR_CACHE: {
            "condition": lambda a: a.severity == AlertSeverity.WARNING,
            "command": "sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || echo 'cache clear unavailable'",
            "description": "Clear system cache to free memory",
            "cooldown_minutes": 15,
            "risk": "low",
        },
        RemediationAction.KILL_TOP_CPU: {
            "condition": lambda a: a.severity == AlertSeverity.CRITICAL,
            "command": 'ps -eo pid,%mem,comm --sort=-%mem | head -2 | tail -1 | awk "{print $1}" | xargs -r kill -9',
            "description": "Kill the process consuming the most memory",
            "cooldown_minutes": 10,
            "risk": "high",
        },
        RemediationAction.NOTIFY_ONLY: {
            "condition": lambda a: True,
            "command": None,
            "description": "Notify administrator of high memory",
            "cooldown_minutes": 5,
            "risk": "none",
        },
    },
    "disk": {
        RemediationAction.CLEAN_TEMP_FILES: {
            "condition": lambda a: a.severity == AlertSeverity.WARNING,
            "command": "find /tmp -type f -atime +7 -delete 2>/dev/null; find /var/tmp -type f -atime +7 -delete 2>/dev/null",
            "description": "Clean temp files older than 7 days",
            "cooldown_minutes": 60,
            "risk": "low",
        },
        RemediationAction.COMPRESS_LOGS: {
            "condition": lambda a: a.severity == AlertSeverity.WARNING,
            "command": "find /var/log -name '*.log' -exec gzip {} \\; 2>/dev/null",
            "description": "Compress rotated log files",
            "cooldown_minutes": 120,
            "risk": "low",
        },
        RemediationAction.NOTIFY_ONLY: {
            "condition": lambda a: True,
            "command": None,
            "description": "Notify administrator of disk pressure",
            "cooldown_minutes": 5,
            "risk": "none",
        },
    },
}


class RemediationLog:
    """Record of a single remediation action taken."""
    def __init__(
        self,
        alert_id: str,
        server: str,
        metric: str,
        action: RemediationAction,
        description: str,
        status: RemediationStatus,
        output: str = "",
        risk: str = "low",
    ):
        self.id = str(uuid.uuid4())
        self.alert_id = alert_id
        self.server = server
        self.metric = metric
        self.action = action
        self.description = description
        self.status = status
        self.output = output
        self.risk = risk
        self.timestamp = datetime.utcnow().isoformat()


class RemediationEngine:
    """
    Evaluates active alerts and executes remediation actions.
    Operates in simulation mode by default — set `auto_remediate = True`
    to enable actual command execution.
    """

    def __init__(self):
        self.auto_remediate: bool = False  # Safety: off by default
        self._cooldowns: dict[str, datetime] = {}
        self._logs: list[RemediationLog] = []
        self._execution_lock = asyncio.Lock()

    async def evaluate_and_remediate(self, alerts: list[Alert]) -> list[RemediationLog]:
        """
        Evaluate all active alerts and execute appropriate remediation actions.

        Args:
            alerts: List of active alerts from the alert engine

        Returns:
            List of remediation logs (actions taken or skipped)
        """
        actions_taken: list[RemediationLog] = []

        for alert in alerts:
            if alert.status != AlertStatus.ACTIVE:
                continue

            # Get recipes for this metric type
            metric = alert.metric.lower()
            recipes = REMEDIATION_RECIPES.get(metric, {})
            if not recipes:
                continue

            # Try each action recipe in order
            for action, recipe in recipes.items():
                # Check cooldown
                cooldown_key = f"{alert.server}:{metric}:{action.value}"
                if cooldown_key in self._cooldowns:
                    if datetime.utcnow() < self._cooldowns[cooldown_key]:
                        logger.info(
                            "Remediation '{}' on {} for {} is on cooldown",
                            action.value, alert.server, metric,
                        )
                        continue

                # Check condition
                if not recipe["condition"](alert):
                    continue

                # Execute
                log = await self._execute_action(
                    alert_id=alert.id,
                    server=alert.server,
                    metric=metric,
                    action=action,
                    recipe=recipe,
                )
                actions_taken.append(log)

                # Set cooldown
                if log.status != RemediationStatus.SKIPPED:
                    self._cooldowns[cooldown_key] = datetime.utcnow() + timedelta(
                        minutes=recipe.get("cooldown_minutes", 10)
                    )

                # Only take one action per alert per cycle
                break

        return actions_taken

    async def _execute_action(
        self,
        alert_id: str,
        server: str,
        metric: str,
        action: RemediationAction,
        recipe: dict,
    ) -> RemediationLog:
        """
        Execute a single remediation action.

        In simulation mode (default), logs what *would* have been done.
        In auto-remediate mode, actually runs the command via SSH/subprocess.
        """
        command = recipe.get("command")
        description = recipe.get("description", f"Execute {action.value}")
        risk = recipe.get("risk", "low")

        if action == RemediationAction.NOTIFY_ONLY:
            # Notification-only actions are always "successful"
            return RemediationLog(
                alert_id=alert_id,
                server=server,
                metric=metric,
                action=action,
                description=description,
                status=RemediationStatus.SUCCESS,
                output=f"Notification generated for {server}: {metric} alert",
                risk=risk,
            )

        if not self.auto_remediate:
            # Simulation mode
            log = RemediationLog(
                alert_id=alert_id,
                server=server,
                metric=metric,
                action=action,
                description=description,
                status=RemediationStatus.PENDING,
                output=f"[SIMULATION] Would execute: {command}\n[RISK] {risk}",
                risk=risk,
            )
            self._logs.append(log)
            logger.info(
                "[SIMULATION] Would remediate {} on {} ({}): {}",
                metric, server, action.value, description,
            )
            return log

        # Actual execution mode
        async with self._execution_lock:
            log = RemediationLog(
                alert_id=alert_id,
                server=server,
                metric=metric,
                action=action,
                description=description,
                status=RemediationStatus.EXECUTING,
                risk=risk,
            )

            try:
                logger.info(
                    "Executing remediation: {} on {} ({})",
                    description, server, action.value,
                )

                # Run the command
                if command:
                    process = await asyncio.create_subprocess_shell(
                        command,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        timeout=30,
                    )
                    stdout, stderr = await process.communicate()

                    if process.returncode == 0:
                        log.status = RemediationStatus.SUCCESS
                        log.output = stdout.decode().strip()
                        logger.success(
                            "Remediation successful: {} on {}", description, server,
                        )
                    else:
                        log.status = RemediationStatus.FAILED
                        log.output = stderr.decode().strip()
                        logger.error(
                            "Remediation failed: {} on {}: {}",
                            description, server, log.output,
                        )
                else:
                    log.status = RemediationStatus.SUCCESS
                    log.output = "No command to execute"

            except asyncio.TimeoutError:
                log.status = RemediationStatus.FAILED
                log.output = "Command timed out after 30s"
            except Exception as exc:
                log.status = RemediationStatus.FAILED
                log.output = str(exc)

            self._logs.append(log)
            return log

    def get_logs(
        self,
        server: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get remediation action logs, optionally filtered by server."""
        logs = self._logs
        if server:
            logs = [l for l in logs if l.server == server]
        logs = logs[-limit:]
        return [
            {
                "id": l.id,
                "alert_id": l.alert_id,
                "server": l.server,
                "metric": l.metric,
                "action": l.action.value,
                "description": l.description,
                "status": l.status.value,
                "output": l.output,
                "risk": l.risk,
                "timestamp": l.timestamp,
            }
            for l in logs
        ]

    def get_stats(self) -> dict[str, Any]:
        """Get remediation engine statistics."""
        total = len(self._logs)
        by_status: dict[str, int] = {}
        by_metric: dict[str, int] = {}
        for log in self._logs:
            by_status[log.status.value] = by_status.get(log.status.value, 0) + 1
            by_metric[log.metric] = by_metric.get(log.metric, 0) + 1
        return {
            "total_actions": total,
            "by_status": by_status,
            "by_metric": by_metric,
            "auto_remediate_enabled": self.auto_remediate,
            "active_cooldowns": len(self._cooldowns),
        }

    def enable_auto_remediate(self, enabled: bool = True) -> None:
        """Enable or disable automatic remediation execution."""
        self.auto_remediate = enabled
        logger.info("Auto-remediation {}", "enabled" if enabled else "disabled")


# Singleton engine
remediation_engine = RemediationEngine()
