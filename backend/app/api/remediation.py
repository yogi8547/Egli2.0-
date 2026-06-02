"""
Remediation, Forecasting, and Anomaly Detection API endpoints.

Endpoints:
- GET  /api/remediation/logs         — Get remediation action logs
- GET  /api/remediation/stats        — Get remediation engine statistics
- POST /api/remediation/toggle       — Enable/disable auto-remediation
- GET  /api/forecasts                — Get predictive forecasts for all servers
- GET  /api/forecasts/{server}       — Get forecasts for a specific server
- GET  /api/anomalies                — Get recent anomaly detections
- GET  /api/anomalies/summary        — Get anomaly detection summary
- GET  /api/anomalies/baselines      — Get learned baselines
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.remediation_engine import remediation_engine
from app.services.forecaster import forecaster
from app.services.anomaly_detector import anomaly_detector

router = APIRouter(prefix="/api", tags=["self-healing"])


# ── Remediation Endpoints ─────────────────────────────────────────────────


@router.get("/remediation/logs")
async def get_remediation_logs(
    server: Optional[str] = Query(default=None, description="Filter by server"),
    alert_id: Optional[str] = Query(default=None, description="Filter by alert ID"),
    limit: int = Query(default=50, description="Max logs to return"),
):
    """Get remediation action logs."""
    logs = remediation_engine.get_logs(server=server, alert_id=alert_id, limit=limit)
    return {"logs": logs, "total": len(logs)}


@router.get("/remediation/stats")
async def get_remediation_stats():
    """Get remediation engine statistics."""
    return remediation_engine.get_stats()


@router.post("/remediation/toggle")
async def toggle_auto_remediate(enabled: bool = True):
    """Enable or disable automatic remediation execution."""
    remediation_engine.enable_auto_remediate(enabled)
    return {
        "auto_remediate_enabled": enabled,
        "message": f"Auto-remediation {'enabled' if enabled else 'disabled'}",
    }


# ── Forecasting Endpoints ──────────────────────────────────────────────────


@router.get("/forecasts")
async def get_all_forecasts():
    """Get predictive forecasts for all servers."""
    from app.services.snmp_poller import poller
    server_names = [s.get("name") for s in poller.servers if s.get("name")]
    forecasts = forecaster.forecast_all(server_names)
    return {"forecasts": forecasts, "total": len(forecasts)}


@router.get("/forecasts/{server}")
async def get_server_forecasts(server: str):
    """Get predictive forecasts for a specific server."""
    cpu = forecaster.forecast(server, "cpu_percent")
    mem = forecaster.forecast(server, "memory_percent")
    disk = forecaster.forecast(server, "disk_percent")
    results = []
    for f in [cpu, mem, disk]:
        if f:
            results.append(f.to_dict())
    return {"server": server, "forecasts": results}


# ── Anomaly Detection Endpoints ────────────────────────────────────────────


@router.get("/anomalies")
async def get_anomalies(
    server: Optional[str] = Query(default=None, description="Filter by server"),
    limit: int = Query(default=50, description="Max anomalies to return"),
):
    """Get recent anomaly detections."""
    anomalies = anomaly_detector.get_recent_anomalies(server=server, limit=limit)
    return {"anomalies": anomalies, "total": len(anomalies)}


@router.get("/anomalies/summary")
async def get_anomaly_summary():
    """Get anomaly detection summary stats."""
    return anomaly_detector.get_summary()


@router.get("/anomalies/baselines")
async def get_anomaly_baselines():
    """Get all learned baselines."""
    baselines = anomaly_detector.get_baseline_stats()
    return {"baselines": baselines, "total": len(baselines)}


# ── Combined Intelligence Endpoint ──────────────────────────────────────────


@router.get("/intelligence")
async def get_intelligence_summary():
    """Get a combined summary of all self-healing intelligence."""
    from app.services.snmp_poller import poller
    server_names = [s.get("name") for s in poller.servers if s.get("name")]

    return {
        "remediation": remediation_engine.get_stats(),
        "anomaly_detection": anomaly_detector.get_summary(),
        "forecasts": forecaster.forecast_all(server_names),
    }
