"""
Alert engine — evaluates metrics against thresholds and generates alerts.

Supports:
- CPU, memory, disk threshold-based alerts
- Automatic severity assignment
- AI-generated remediation suggestions (via ai_service)
- Alert lifecycle management (active, acknowledged, resolved)
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Optional

from loguru import logger

from app.config import settings
from app.models.schemas import Alert, AlertSeverity, AlertStatus
from app.services.vector_store import vector_store


class AlertEngine:
    """
    Evaluates metric snapshots against configured thresholds.
    Maintains an in-memory store of active alerts.
    """

    def __init__(self) -> None:
        self._alerts: dict[str, Alert] = {}
        self._cooldown_minutes: float = 5.0  # Prevent duplicate alerts within N minutes

    def evaluate_snapshot(self, snapshot: dict) -> list[Alert]:
        """
        Evaluate a metric snapshot against all thresholds.

        Args:
            snapshot: MetricSnapshot dict from the poller

        Returns:
            List of newly triggered alerts (may be empty)
        """
        new_alerts: list[Alert] = []
        server = snapshot.get("server", "unknown")
        now = datetime.utcnow().isoformat()

        # ── CPU Evaluation ──────────────────────────────────────────────
        cpu = snapshot.get("cpu_percent", 0.0)
        if cpu >= settings.cpu_crit_threshold:
            alert = self._create_alert(
                server=server, metric="cpu", value=cpu,
                threshold=settings.cpu_crit_threshold,
                severity=AlertSeverity.CRITICAL,
                message=f"CRITICAL: {server} CPU at {cpu}% (threshold: {settings.cpu_crit_threshold}%)",
                now=now,
            )
            if alert:
                new_alerts.append(alert)
        elif cpu >= settings.cpu_warn_threshold:
            alert = self._create_alert(
                server=server, metric="cpu", value=cpu,
                threshold=settings.cpu_warn_threshold,
                severity=AlertSeverity.WARNING,
                message=f"WARNING: {server} CPU at {cpu}% (threshold: {settings.cpu_warn_threshold}%)",
                now=now,
            )
            if alert:
                new_alerts.append(alert)

        # ── Memory Evaluation ───────────────────────────────────────────
        mem = snapshot.get("memory_percent", 0.0)
        if mem >= settings.mem_crit_threshold:
            alert = self._create_alert(
                server=server, metric="memory", value=mem,
                threshold=settings.mem_crit_threshold,
                severity=AlertSeverity.CRITICAL,
                message=f"CRITICAL: {server} memory at {mem}% (threshold: {settings.mem_crit_threshold}%)",
                now=now,
            )
            if alert:
                new_alerts.append(alert)
        elif mem >= settings.mem_warn_threshold:
            alert = self._create_alert(
                server=server, metric="memory", value=mem,
                threshold=settings.mem_warn_threshold,
                severity=AlertSeverity.WARNING,
                message=f"WARNING: {server} memory at {mem}% (threshold: {settings.mem_warn_threshold}%)",
                now=now,
            )
            if alert:
                new_alerts.append(alert)

        # ── Disk Evaluation ─────────────────────────────────────────────
        disk = snapshot.get("disk_percent", 0.0)
        if disk >= settings.disk_crit_threshold:
            alert = self._create_alert(
                server=server, metric="disk", value=disk,
                threshold=settings.disk_crit_threshold,
                severity=AlertSeverity.CRITICAL,
                message=f"CRITICAL: {server} disk at {disk}% (threshold: {settings.disk_crit_threshold}%)",
                now=now,
            )
            if alert:
                new_alerts.append(alert)
        elif disk >= settings.disk_warn_threshold:
            alert = self._create_alert(
                server=server, metric="disk", value=disk,
                threshold=settings.disk_warn_threshold,
                severity=AlertSeverity.WARNING,
                message=f"WARNING: {server} disk at {disk}% (threshold: {settings.disk_warn_threshold}%)",
                now=now,
            )
            if alert:
                new_alerts.append(alert)

        # ── Connectivity / Network Health Evaluation ────────────────────
        # Check if the server is reporting metrics at all
        uptime = snapshot.get("uptime_seconds", -1)
        if uptime < 0 or uptime is None:
            alert = self._create_alert(
                server=server, metric="connectivity", value=0,
                threshold=1,
                severity=AlertSeverity.CRITICAL,
                message=f"CRITICAL: {server} is not responding to SNMP polls",
                now=now,
            )
            if alert:
                new_alerts.append(alert)

        # Network traffic anomalies (sudden drop could indicate interface issues)
        rx = snapshot.get("network_rx_bytes", -1)
        tx = snapshot.get("network_tx_bytes", -1)
        if rx == 0 and tx == 0:
            # Zero traffic could indicate interface down (but might be idle)
            # Only alert if server was previously reporting traffic
            # This is a lightweight check; deep network analysis would need baseline comparison
            pass  # Placeholder for future baseline-based network anomaly detection

        return new_alerts

    def _create_alert(self, server: str, metric: str, value: float,
                      threshold: float, severity: AlertSeverity,
                      message: str, now: str) -> Optional[Alert]:
        """Create an alert if a similar one is not on cooldown.

        Allows escalation: a CRITICAL alert can replace an existing
        WARNING alert for the same server+metric.
        """
        # Check cooldown: prevent duplicate alerts in quick succession
        severity_rank = {
            AlertSeverity.INFO: 0,
            AlertSeverity.WARNING: 1,
            AlertSeverity.CRITICAL: 2,
        }
        new_rank = severity_rank.get(severity, 0)

        for existing in list(self._alerts.values()):
            if (existing.server == server
                and existing.metric == metric
                and existing.status == AlertStatus.ACTIVE):
                existing_rank = severity_rank.get(existing.severity, 0)
                if new_rank > existing_rank:
                    # Escalating: resolve the lower-severity alert
                    existing.status = AlertStatus.RESOLVED
                    existing.resolved_at = datetime.utcnow().isoformat()
                    break  # Allow creating the higher-severity alert
                else:
                    return None  # Already have an equal or higher severity alert

        alert = Alert(
            id=str(uuid.uuid4()),
            server=server,
            metric=metric,
            value=value,
            threshold=threshold,
            severity=severity,
            status=AlertStatus.ACTIVE,
            message=message,
            created_at=now,
        )
        self._alerts[alert.id] = alert
        logger.warning("Alert triggered: {}", message)

        # Embed in vector store for semantic search (best-effort)
        # This runs in background so it doesn't block alert creation
        try:
            asyncio.ensure_future(vector_store.embed_and_store_alert(alert.model_dump()))
        except Exception:
            pass

        return alert

    def acknowledge_alert(self, alert_id: str) -> Optional[Alert]:
        """Mark an alert as acknowledged."""
        if alert_id in self._alerts and self._alerts[alert_id].status == AlertStatus.ACTIVE:
            self._alerts[alert_id].status = AlertStatus.ACKNOWLEDGED
            logger.info("Alert {} acknowledged", alert_id)
            return self._alerts[alert_id]
        return None

    def resolve_alert(self, alert_id: str) -> Optional[Alert]:
        """Mark an alert as resolved."""
        if alert_id in self._alerts:
            self._alerts[alert_id].status = AlertStatus.RESOLVED
            self._alerts[alert_id].resolved_at = datetime.utcnow().isoformat()
            logger.info("Alert {} resolved", alert_id)
            # Remove from vector store (best-effort, background)
            try:
                asyncio.ensure_future(vector_store.delete_alert(alert_id))
            except Exception:
                pass
            return self._alerts[alert_id]
        return None

    def set_remediation(self, alert_id: str, remediation: str) -> None:
        """Attach AI-generated remediation to an alert.

        Also syncs the remediation back to Qdrant so future similar
        alerts can find it via the semantic cache (search_remediation_cache).
        """
        if alert_id in self._alerts:
            self._alerts[alert_id].remediation = remediation
            # Sync to vector store for future cache lookups (best-effort)
            try:
                asyncio.ensure_future(
                    vector_store.update_alert_remediation(alert_id, remediation)
                )
            except Exception:
                pass

    def get_active_alerts(self) -> list[Alert]:
        """Get all alerts with ACTIVE status."""
        return [
            a for a in self._alerts.values()
            if a.status == AlertStatus.ACTIVE
        ]

    def get_all_alerts(self) -> list[Alert]:
        """Get all alerts regardless of status."""
        return list(self._alerts.values())

    def get_alerts_by_server(self, server: str) -> list[Alert]:
        """Get all alerts for a specific server."""
        return [
            a for a in self._alerts.values()
            if a.server == server
        ]

    async def find_similar_alerts(self, alert_or_query: Alert | str, top_k: int = 5) -> list[dict]:
        """
        Find semantically similar alerts using vector search.

        Args:
            alert_or_query: Alert object or a text query string
            top_k: Maximum number of similar alerts to return

        Returns:
            List of similar alert dicts with similarity scores
        """
        if isinstance(alert_or_query, Alert):
            query = (
                f"Alert on {alert_or_query.server}: "
                f"{alert_or_query.metric} - "
                f"{alert_or_query.message}"
            )
        else:
            query = alert_or_query

        return await vector_store.similarity_search(
            query=query,
            server_filter=None,  # Include cross-server patterns
            top_k=top_k,
        )

    def evaluate_custom_check(self, check_name: str, server: str, result: dict) -> Optional[Alert]:
        """
        Evaluate a custom check result and create an alert if the check failed.

        Custom checks that are offline or degraded trigger alerts.
        Checks that recover (were offline, now online) automatically resolve
        the previous alert.

        Args:
            check_name: Name of the custom check (e.g. 'tomcat', 'opensip')
            server: Server ID the check ran on
            result: CustomCheckResult dict with success, status, message, etc.

        Returns:
            Newly created Alert if triggered, None otherwise
        """
        now = datetime.utcnow().isoformat()
        metric = f"service_{check_name}"
        is_healthy = result.get("success", False)
        status = result.get("status", "unknown")
        message = result.get("message", "")

        # Look for existing active alert for this server+check
        existing_alert = None
        for alert in self._alerts.values():
            if (alert.server == server
                and alert.metric == metric
                and alert.status == AlertStatus.ACTIVE):
                existing_alert = alert
                break

        if is_healthy and status == "online":
            # Check recovered — resolve any existing alert
            if existing_alert:
                existing_alert.status = AlertStatus.RESOLVED
                existing_alert.resolved_at = now
                logger.info("Custom check '{}' on {} recovered — alert resolved", check_name, server)
            return None

        if not is_healthy:
            # Check failed — create alert if not already active
            if existing_alert:
                return None  # Already alerted

            severity = (
                AlertSeverity.CRITICAL
                if status == "offline"
                else AlertSeverity.WARNING
            )
            alert = Alert(
                id=str(uuid.uuid4()),
                server=server,
                metric=metric,
                value=0.0,
                threshold=1,
                severity=severity,
                status=AlertStatus.ACTIVE,
                message=f"[{severity.upper()}] {server}/{check_name} — {message}",
                created_at=now,
            )
            self._alerts[alert.id] = alert
            logger.warning("Custom check alert triggered: {} on {}: {}", check_name, server, message)

            # Embed in vector store (best-effort)
            try:
                asyncio.ensure_future(vector_store.embed_and_store_alert(alert.model_dump()))
            except Exception:
                pass

            return alert

        return None

    def clear_resolved(self) -> int:
        """Remove resolved alerts older than 24 hours. Returns count removed."""
        now = datetime.utcnow()
        to_remove = []
        for aid, alert in self._alerts.items():
            if alert.status == AlertStatus.RESOLVED and alert.resolved_at:
                resolved_time = datetime.fromisoformat(alert.resolved_at)
                if (now - resolved_time).total_seconds() > 86400:
                    to_remove.append(aid)
        for aid in to_remove:
            del self._alerts[aid]
        return len(to_remove)


# Singleton engine
alert_engine = AlertEngine()
