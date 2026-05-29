"""
Metrics API — retrieve current and historical metric data.

Endpoints:
- GET /api/metrics            — Get current metrics for all servers
- GET /api/metrics/{server}   — Get metrics for a specific server
- GET /api/metrics/history/{server}/{measurement} — Historical metrics
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.database import db
from app.models.schemas import MetricSnapshot, MetricsResponse
from app.services.snmp_poller import poller

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("", response_model=MetricsResponse)
async def get_current_metrics():
    """Get current metrics for all monitored servers."""
    snapshots: list[MetricSnapshot] = []
    for server in poller.servers:
        server_id = server.get("id", "unknown")
        snapshot = poller.poll_server(server_id)
        if snapshot:
            snapshots.append(MetricSnapshot(**snapshot))
    return MetricsResponse(metrics=snapshots, total=len(snapshots))


@router.get("/{server}", response_model=MetricSnapshot)
async def get_server_metrics(server: str):
    """Get current metrics for a specific server."""
    snapshot = poller.poll_server(server)
    if not snapshot:
        # Try generating on-the-fly mock data
        snapshot = poller.get_mock_snapshot(server)
    return MetricSnapshot(**snapshot)


@router.get("/history/{server}/{measurement}")
async def get_metric_history(
    server: str,
    measurement: str,
    hours: float = Query(default=1.0, description="Lookback hours"),
    limit: int = Query(default=200, description="Max data points"),
):
    """Get historical metrics for a server's measurement from InfluxDB."""
    points = db.query_metrics(measurement, server=server, duration_hours=hours, limit=limit)
    if not points:
        # Return empty history instead of 404 for graceful frontend handling
        return {"points": [], "measurement": measurement, "server": server}
    return {"points": points, "measurement": measurement, "server": server}
