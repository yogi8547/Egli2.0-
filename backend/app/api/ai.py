"""
AI-powered analysis and natural language chat endpoints.

Endpoints:
- POST /api/ai/analyze      — Send infrastructure data for AI analysis
- POST /api/ai/chat         — Natural language query about infrastructure
- GET  /api/ai/health       — Get AI-generated health report
- GET  /api/ai/models       — List available Ollama models
- POST /api/ai/chat/stream  — Streaming chat endpoint (SSE)
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger

from app.database import db
from app.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ChatRequest,
    ChatResponse,
    MetricSnapshot,
    SystemOverview,
)
from app.services.ai_service import ai_service
from app.services.alert_engine import alert_engine
from app.services.snmp_poller import poller

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_infrastructure(req: AnalyzeRequest):
    """Send infrastructure data for AI-powered analysis."""
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="Ollama is not available. Start it with: ollama serve")

    # Convert incoming data to MetricSnapshots if possible
    metrics_data = req.data.get("metrics", [])
    snapshots = [MetricSnapshot(**m) if isinstance(m, dict) else m for m in metrics_data]

    if snapshots:
        analysis = await ai_service.analyze_metrics(snapshots)
    else:
        analysis = await ai_service.generate(
            str(req.data),
            system_prompt="Analyze this infrastructure data and provide insights.",
        )

    return AnalyzeResponse(
        analysis=analysis,
        model=ai_service.model,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(req: ChatRequest):
    """Ask a natural language question about your infrastructure."""
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="Ollama is not available")

    # Gather context
    snapshots: list[MetricSnapshot] = []
    for server in poller.servers:
        s = poller.poll_server(server.get("id", ""))
        if s:
            snapshots.append(MetricSnapshot(**s))

    # If no metrics from poller, generate mock snapshots
    if not snapshots:
        for server in poller.servers:
            s = poller.get_mock_snapshot(server.get("id", "unknown"))
            snapshots.append(MetricSnapshot(**s))

    alerts = alert_engine.get_active_alerts()

    response = await ai_service.chat_query(
        message=req.message,
        metrics=snapshots,
        alerts=alerts,
        server=req.server,
    )

    return ChatResponse(
        response=response,
        model=ai_service.model,
        context_used={
            "metrics_count": len(snapshots),
            "alerts_count": len(alerts),
            "server_filter": req.server,
        },
    )


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Stream a natural language response from the AI."""
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="Ollama is not available")

    # Gather context (same as non-streaming)
    snapshots: list[MetricSnapshot] = []
    for server in poller.servers:
        s = poller.poll_server(server.get("id", ""))
        if s:
            snapshots.append(MetricSnapshot(**s))

    if not snapshots:
        for server in poller.servers:
            s = poller.get_mock_snapshot(server.get("id", "unknown"))
            snapshots.append(MetricSnapshot(**s))

    alerts = alert_engine.get_active_alerts()

    messages = [
        {
            "role": "user",
            "content": (
                f"Current Metrics:\n{ai_service._format_metrics_context(snapshots, req.server)}\n\n"
                f"Active Alerts:\n{ai_service._format_alerts_context(alerts, req.server)}\n\n"
                f"User Question: {req.message}"
            ),
        }
    ]

    system_prompt = (
        "You are an expert infrastructure monitoring assistant. "
        "Answer based on the provided server metrics and alerts. "
        "Be concise and actionable."
    )

    async def event_stream():
        async for token in ai_service.chat_stream(messages, system_prompt=system_prompt):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/health")
async def get_ai_health_report():
    """Get an AI-generated infrastructure health report."""
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="Ollama is not available")

    # Gather overview data
    snapshots: list[MetricSnapshot] = []
    for server in poller.servers:
        s = poller.poll_server(server.get("id", ""))
        if s:
            snapshots.append(MetricSnapshot(**s))

    if not snapshots:
        for server in poller.servers:
            s = poller.get_mock_snapshot(server.get("id", "unknown"))
            snapshots.append(MetricSnapshot(**s))

    alerts = alert_engine.get_active_alerts()

    overview = SystemOverview(
        total_servers=len(snapshots),
        online_servers=len(snapshots),
        active_alerts=len(alerts),
        avg_cpu=sum(m.cpu_percent for m in snapshots) / len(snapshots) if snapshots else 0,
        avg_memory=sum(m.memory_percent for m in snapshots) / len(snapshots) if snapshots else 0,
        avg_disk=sum(m.disk_percent for m in snapshots) / len(snapshots) if snapshots else 0,
    )

    report = await ai_service.generate_health_report(overview, alerts, snapshots)
    return {
        "overview": overview.model_dump(),
        "report": report,
        "model": ai_service.model,
    }


@router.get("/models")
async def list_ai_models():
    """List available Ollama models and their status."""
    models = ai_service.get_available_models()
    return {
        "models": models,
        "active_model": ai_service.model,
        "ollama_available": ai_service.is_available(),
    }
