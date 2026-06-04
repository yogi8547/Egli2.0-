"""
Egli2.0 — FastAPI Application Entry Point.

Initializes the web server, connects to InfluxDB, seeds mock data,
and registers all API routes and WebSocket endpoints.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.api import ai, alerts, custom_checks, metrics, remediation, servers, vector_search, ws
from app.config import settings
from app.database import db
from app.models.schemas import HealthResponse
from app.services.vector_store import vector_store


# ── Application Lifecycle ─────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # ── Startup ─────────────────────────────────────────────────────────
    logger.info("Starting {} v1.0.0", settings.app_name)
    logger.info("Log level: {}", settings.log_level)

    # Connect to InfluxDB
    try:
        db.connect()
        logger.info("InfluxDB connected: {}", settings.influxdb_url)
    except Exception as exc:
        logger.warning("InfluxDB not available (running in mock mode): {}", exc)

    # Seed mock servers for development
    if settings.seed_mock_data:
        servers.seed_mock_servers()
        logger.info("Seeded {} mock servers", settings.mock_server_count)

    # Wire up servers dict reference for WebSocket status change detection
    # (avoids circular import between ws.py and servers.py)
    ws.manager.set_servers_ref(servers.get_servers_dict())
    logger.info("WebSocket manager linked to servers dict")

    # Re-index existing alerts into Qdrant on startup (best-effort)
    if settings.qdrant_reindex_on_start:
        try:
            from app.services.alert_engine import alert_engine as startup_alert_engine
            existing = startup_alert_engine.get_all_alerts()
            if existing:
                alert_dicts = [a.model_dump() for a in existing]
                asyncio.create_task(vector_store.reindex_alerts(alert_dicts))
        except Exception as exc:
            logger.warning("Startup vector reindex skipped: {}", exc)

    app.state.start_time = time.time()
    yield

    # ── Shutdown ────────────────────────────────────────────────────────
    db.close()
    logger.info("Shutdown complete")


# ── App Factory ───────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Self-hosted AI-powered infrastructure monitoring platform",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Logging Middleware ───────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests with timing."""
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    logger.debug("{} {} -> {} ({:.2f}s)",
                 request.method, request.url.path,
                 response.status_code, elapsed)
    return response


# ── Global Exception Handler ─────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return a 500."""
    logger.error("Unhandled exception on {} {}: {}",
                 request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


# ── Register Routers ─────────────────────────────────────────────────────

app.include_router(servers.router)
app.include_router(metrics.router)
app.include_router(alerts.router)
app.include_router(ai.router)

# Self-healing / intelligence routers
app.include_router(remediation.router)

# Custom service checks
app.include_router(custom_checks.router)

# Vector search / Qdrant
app.include_router(vector_search.router)

# WebSocket router (no prefix)
app.include_router(ws.router)


# ── Built-in Endpoints ───────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint — used by Docker health checks and monitoring."""
    from app.services.ai_service import ai_service

    uptime = time.time() - app.state.start_time if hasattr(app.state, "start_time") else 0

    # Actual connectivity checks (with graceful fallback)
    influx_ok = db.is_connected() if hasattr(db, 'is_connected') else False
    ollama_ok = ai_service.is_available()

    # AI remediation cache performance stats
    cache_stats = ai_service.get_cache_stats()

    return HealthResponse(
        status="ok",
        version="1.0.0",
        uptime_seconds=uptime,
        influxdb_connected=influx_ok,
        ollama_connected=ollama_ok,
        vector_cache_stats=cache_stats,
    )


@app.get("/api/overview")
async def system_overview():
    """Dashboard overview with aggregate stats."""
    from app.services.alert_engine import alert_engine
    from app.services.snmp_poller import poller
    from app.api.servers import get_servers_dict

    servers_dict = get_servers_dict()
    servers_list = list(servers_dict.values())
    active_alerts = alert_engine.get_active_alerts()

    # Compute aggregate metrics
    total = len(servers_list)
    online = sum(1 for s in servers_list if s.status.value == "online")
    offline = sum(1 for s in servers_list if s.status.value == "offline")
    degraded = sum(1 for s in servers_list if s.status.value == "degraded")

    return {
        "total_servers": total,
        "online_servers": online,
        "offline_servers": offline,
        "degraded_servers": degraded,
        "active_alerts": len(active_alerts),
        "avg_cpu": 0,
        "avg_memory": 0,
        "avg_disk": 0,
        "current_time": datetime.utcnow().isoformat(),
    }


# ── Serve Frontend (production) ─────────────────────────────────────────

import os
from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info("Serving frontend from {}", FRONTEND_DIR)
else:
    logger.info("No frontend build found at {} — API mode only", FRONTEND_DIR)
