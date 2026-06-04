"""
WebSocket endpoint for real-time metric streaming to the dashboard.

Clients connect and receive periodic metric snapshots as JSON messages.
The polling interval is controlled by the server configuration.
"""

from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.config import settings
from app.models.schemas import MetricSnapshot, ServerStatus
from app.services.alert_engine import alert_engine
from app.services.custom_checks import custom_check_runner
from app.services.snmp_poller import poller
from app.services.vector_store import vector_store

router = APIRouter()


class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts metric data.
    """

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._broadcast_task: Optional[asyncio.Task] = None
        self._servers_ref: Optional[dict] = None

    def set_servers_ref(self, servers_dict: dict) -> None:
        """Set a reference to the servers dict (called at startup to avoid circular imports)."""
        self._servers_ref = servers_dict

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.info("WebSocket client connected ({} total)", len(self._connections))

        # Start background broadcaster if not already running
        if self._broadcast_task is None or self._broadcast_task.done():
            self._broadcast_task = asyncio.create_task(self._broadcast_loop())

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.info("WebSocket client disconnected ({} remaining)", len(self._connections))

    async def broadcast(self, message: dict) -> None:
        """Send a JSON message to all connected clients."""
        stale = set()
        for ws in self._connections:
            try:
                await ws.send_json(message)
            except Exception:
                stale.add(ws)
        for ws in stale:
            self.disconnect(ws)

    async def broadcast_server_event(self, event_type: str, server: dict) -> None:
        """Broadcast a server CRUD event (added, updated, deleted) to all clients."""
        await self.broadcast({
            "type": "server_event",
            "event": event_type,
            "server": server,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        })

    async def broadcast_status_change(self, server_id: str, old_status: str, new_status: str) -> None:
        """Broadcast a server status change to all clients."""
        await self.broadcast({
            "type": "server_status_change",
            "server_id": server_id,
            "old_status": old_status,
            "new_status": new_status,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        })

    async def _broadcast_loop(self) -> None:
        """Continuously poll and broadcast metrics to all clients."""
        while self._connections:
            try:
                # poll_all() returns list[dict[str, Any]] — flat list of metric snapshots
                snapshots = poller.poll_all()

                # Use poller's real SNMP success tracking to detect status changes
                servers_dict = self._servers_ref or {}
                poll_status = poller.get_poll_status()
                for server_id, srv in servers_dict.items():
                    is_reachable = poll_status.get(server_id, False)
                    new_status = ServerStatus.ONLINE if is_reachable else ServerStatus.OFFLINE
                    if srv.status != new_status:
                        # Skip broadcast on first poll (UNKNOWN -> ONLINE/OFFLINE is expected)
                        old_status = srv.status.value
                        srv.status = new_status
                        if old_status != "unknown":
                            await self.broadcast_status_change(server_id, old_status, new_status.value)

                # Run custom service checks (TCP port, HTTP health, etc.)
                checks_per_server: dict[str, list] = {}
                if self._servers_ref:
                    for srv_id, srv in self._servers_ref.items():
                        if srv.custom_checks:
                            checks_per_server[srv_id] = srv.custom_checks

                check_results = await custom_check_runner.run_all(checks_per_server)

                # Evaluate custom check results against alert engine
                check_new_alerts = []
                for cr in check_results:
                    alert = alert_engine.evaluate_custom_check(
                        check_name=cr.name,
                        server=cr.server,
                        result=cr.model_dump(),
                    )
                    if alert:
                        check_new_alerts.append(alert)

                # Check for alerts from SNMP metrics
                all_new_alerts = []
                for snap in snapshots:
                    new_alerts = alert_engine.evaluate_snapshot(snap)
                    all_new_alerts.extend(new_alerts)

                all_new_alerts.extend(check_new_alerts)

                # Get current active alerts
                active_alerts = alert_engine.get_active_alerts()

                # Build broadcast payload (snapshots are already dicts)
                payload: dict = {
                    "type": "metrics_update",
                    "metrics": snapshots,
                    "alerts": [a.model_dump() for a in active_alerts],
                    "new_alerts": [a.model_dump() for a in all_new_alerts],
                    "custom_check_results": [r.model_dump() for r in check_results],
                    "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                }

                # Add similar alert suggestions for new critical alerts (best-effort, with timeout)
                if all_new_alerts:
                    try:
                        for new_alert in all_new_alerts:
                            if new_alert.severity.value in ("critical", "warning"):
                                similar = await asyncio.wait_for(
                                    vector_store.similarity_search(
                                        query=f"{new_alert.server} {new_alert.metric} {new_alert.message}",
                                        top_k=3,
                                        score_threshold=0.4,
                                    ),
                                    timeout=3.0,
                                )
                                if similar:
                                    payload.setdefault("similar_alerts", {})
                                    payload["similar_alerts"][new_alert.id] = similar
                    except (asyncio.TimeoutError, Exception) as exc:
                        logger.debug("Vector search in WS loop: {}", exc)

                await self.broadcast(payload)
            except Exception as exc:
                logger.error("Broadcast error: {}", exc)

            await asyncio.sleep(settings.poll_interval_seconds)

    @property
    def active_connections(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


@router.websocket("/ws/metrics")
async def metrics_websocket(ws: WebSocket):
    """
    WebSocket endpoint for live metric streaming.

    Connects to the broadcast manager and receives periodic
    metric snapshot updates and alert notifications.
    """
    await manager.connect(ws)
    try:
        # Keep connection alive until client disconnects
        while True:
            # Listen for client messages (ping/pong for keepalive)
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"type": "pong"})
            elif data.startswith("poll:"):
                # Client requests an immediate poll for a specific server
                server_id = data.split(":", 1)[1]
                snapshot = poller.poll_server(server_id)
                if snapshot:
                    await ws.send_json({
                        "type": "server_update",
                        "server": server_id,
                        "metrics": snapshot,
                    })
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as exc:
        logger.error("WebSocket error: {}", exc)
        manager.disconnect(ws)
