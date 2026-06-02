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

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import Alert, AlertListResponse
from app.services.alert_engine import alert_engine
from app.services.ai_service import ai_service
from app.services.remediation_engine import remediation_engine

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


@router.get("/{alert_id}/remediation-actions")
async def get_predefined_remediation_actions(alert_id: str):
    """Get predefined remediation actions for an alert (instant, no AI)."""
    alerts = alert_engine.get_all_alerts()
    target = next((a for a in alerts if a.id == alert_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")

    actions = remediation_engine.get_predefined_actions(target)
    return {
        "alert_id": alert_id,
        "metric": target.metric,
        "actions": actions,
        "total": len(actions),
    }


@router.post("/{alert_id}/execute-action")
async def execute_remediation_action(alert_id: str, action: str = Query(..., description="Action name to execute (e.g. kill_top_cpu_process)")):
    """Execute a single predefined remediation action for an alert."""
    alerts = alert_engine.get_all_alerts()
    target = next((a for a in alerts if a.id == alert_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")

    result = await remediation_engine.execute_single_action(target, action)
    return {
        "alert_id": alert_id,
        "result": result,
    }


@router.post("/{alert_id}/remediate")
async def get_ai_remediation(alert_id: str, deep: bool = False):
    """
    Get remediation for an alert.

    - `deep=false` (default): Returns predefined actions instantly (no AI)
    - `deep=true`: Returns AI-generated deep analysis (may be slow)
    """
    alerts = alert_engine.get_all_alerts()
    target = next((a for a in alerts if a.id == alert_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")

    if deep:
        # AI-powered deep analysis (slow)
        remediation = await ai_service.analyze_alert(target)
        alert_engine.set_remediation(alert_id, remediation)
        return {
            "alert_id": alert_id,
            "type": "ai_analysis",
            "remediation": remediation,
        }
    else:
        # Predefined actions (instant)
        actions = remediation_engine.get_predefined_actions(target)
        return {
            "alert_id": alert_id,
            "type": "predefined_actions",
            "actions": actions,
            "total": len(actions),
        }
