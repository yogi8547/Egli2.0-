"""
Server management API — register, list, and manage monitored servers.

Endpoints:
- GET  /api/servers       — List all monitored servers
- POST /api/servers       — Register a new server
- GET  /api/servers/{id}  — Get server details
- DELETE /api/servers/{id} — Remove a server from monitoring
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ServerCreate,
    ServerListResponse,
    ServerResponse,
    ServerStatus,
)
from app.services.snmp_poller import poller

router = APIRouter(prefix="/api/servers", tags=["servers"])

# In-memory store (in production, use a database)
_servers: dict[str, ServerResponse] = {}


@router.get("", response_model=ServerListResponse)
async def list_servers():
    """List all monitored servers with their current status."""
    servers = list(_servers.values())
    return ServerListResponse(servers=servers, total=len(servers))


@router.post("", response_model=ServerResponse, status_code=201)
async def register_server(data: ServerCreate):
    """Register a new server for monitoring."""
    if data.id in _servers:
        raise HTTPException(status_code=409, detail=f"Server '{data.id}' already registered")

    server = ServerResponse(
        id=data.id,
        name=data.name,
        host=data.host,
        port=data.port,
        snmp_version=data.snmp_version,
        snmp_community=data.snmp_community,
        status=ServerStatus.UNKNOWN,
        tags=data.tags,
    )
    _servers[data.id] = server
    poller.register_server(data.model_dump())
    return server


@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(server_id: str):
    """Get details for a specific server."""
    if server_id not in _servers:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")
    return _servers[server_id]


def get_servers_dict() -> dict:
    """Return the internal servers dictionary (for cross-module access in main.py)."""
    return _servers


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: str):
    """Remove a server from monitoring."""
    if server_id not in _servers:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")
    del _servers[server_id]
    poller.remove_server(server_id)


# ── Seed mock servers ────────────────────────────────────────────────────

from datetime import datetime

MOCK_SERVERS = [
    ServerCreate(id="server-01", name="Web Server 01", host="192.168.1.101"),
    ServerCreate(id="server-02", name="Web Server 02", host="192.168.1.102"),
    ServerCreate(id="server-03", name="Database Server", host="192.168.1.201"),
    ServerCreate(id="server-04", name="Cache Server", host="192.168.1.202"),
    ServerCreate(id="server-05", name="Monitoring Node", host="192.168.1.10"),
]

def seed_mock_servers():
    """Seed the server database with mock entries for development/demo."""
    for srv in MOCK_SERVERS:
        if srv.id not in _servers:
            server = ServerResponse(
                id=srv.id,
                name=srv.name,
                host=srv.host,
                port=srv.port,
                snmp_version=srv.snmp_version,
                snmp_community=srv.snmp_community,
                status=ServerStatus.ONLINE,
                tags={"environment": "development", "type": srv.id.split("-")[0]},
                created_at=datetime.utcnow(),
            )
            _servers[srv.id] = server
            poller.register_server(srv.model_dump())
