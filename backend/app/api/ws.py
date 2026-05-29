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
from app.models.schemas import MetricSnapshot
from app.services.alert_engine import alert_engine
from app.services.snmp_poller import poller

router = APIRouter()


class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts metric data.
    """

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._broadcast_task: Optional[asyncio.Task] = None

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

    async def _broadcast_loop(self) -> None:
        """Continuously poll and broadcast metrics to all clients."""
        while self._connections:
            try:
                # Poll all servers
                snapshots = poller.poll_all()

                # Check for alerts
                all_new_alerts = []
                for snap in snapshots:
                    new_alerts = alert_engine.evaluate_snapshot(snap)
                    all_new_alerts.extend(new_alerts)

                # Get current active alerts
                active_alerts = alert_engine.get_active_alerts()

                # Build broadcast payload
                payload = {
                    "type": "metrics_update",
                    "metrics": snapshots,
                    "alerts": [a.model_dump() for a in active_alerts],
                    "new_alerts": [a.model_dump() for a in all_new_alerts],
                    "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                }

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
