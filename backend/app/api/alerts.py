"""
Alert management API — list, acknowledge, and resolve alerts.

Endpoints:
- GET  /api/alerts          — Get all alerts (filtered by status/server)
- GET  /api/alerts/active   — Get active alerts
- POST /api/alerts/{id}/acknowledge  — Acknowledge an alert
- POST /api/alerts/{id}/resolve      — Resolve an alert
- POST /api/alerts/{id}/remediate    — Get AI remediation for an alert
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import Alert, AlertListResponse
from app.services.alert_engine import alert_engine
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=AlertListResponse)
async def get_alerts(
    status: Optional[str] = Query(default=None, description="Filter by status"),
    server: Optional[str] = Query(default=None, description="Filter by server"),
):
    """Get all alerts, optionally filtered by status and/or server."""
    alerts = alert_engine.get_all_alerts()

    if status:
        alerts = [a for a in alerts if a.status.value == status.lower()]
    if server:
        alerts = [a for a in alerts if a.server == server]

    active_count = len([a for a in alerts if a.status.value == "active"])
    return AlertListResponse(alerts=alerts, total=len(alerts), active_count=active_count)


@router.get("/active", response_model=AlertListResponse)
async def get_active_alerts():
    """Get all currently active alerts."""
    alerts = alert_engine.get_active_alerts()
    return AlertListResponse(alerts=alerts, total=len(alerts), active_count=len(alerts))


@router.post("/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(alert_id: str):
    """Acknowledge an alert (mark as being investigated)."""
    alert = alert_engine.acknowledge_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found or not active")
    return alert


@router.post("/{alert_id}/resolve", response_model=Alert)
async def resolve_alert(alert_id: str):
    """Resolve an alert (mark as fixed)."""
    alert = alert_engine.resolve_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return alert


@router.post("/{alert_id}/remediate")
async def get_remediation(alert_id: str):
    """Get AI-suggested remediation for an alert."""
    alert = alert_engine.get_all_alerts()
    target = next((a for a in alert if a.id == alert_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")

    remediation = await ai_service.analyze_alert(target)
    alert_engine.set_remediation(alert_id, remediation)
    return {"alert_id": alert_id, "remediation": remediation}
