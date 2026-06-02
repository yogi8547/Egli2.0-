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

import time as time_module

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    BulkImportRequest,
    BulkImportResponse,
    BulkImportResult,
    ServerCreate,
    ServerListResponse,
    ServerResponse,
    ServerStatus,
    ServerUpdate,
    TestConnectionResult,
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
        snmp_username=data.snmp_username,
        snmp_auth_protocol=data.snmp_auth_protocol,
        snmp_auth_password=data.snmp_auth_password,
        snmp_priv_protocol=data.snmp_priv_protocol,
        snmp_priv_password=data.snmp_priv_password,
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


@router.put("/{server_id}", response_model=ServerResponse)
async def update_server(server_id: str, data: ServerUpdate):
    """Update an existing server's registration details.
    Only provided fields are updated; omitted fields keep their existing values.
    """
    if server_id not in _servers:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")

    existing = _servers[server_id]

    # Build update dict from non-None fields
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(existing, field, value)

    # Re-register in poller with updated info
    poller.remove_server(server_id)
    poller.register_server(existing.model_dump())

    return existing


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: str):
    """Remove a server from monitoring."""
    if server_id not in _servers:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")
    del _servers[server_id]
    poller.remove_server(server_id)


@router.post("/{server_id}/test-connection", response_model=TestConnectionResult)
async def test_server_connection(server_id: str):
    """Attempt an SNMP connection to the server and return the result.

    Useful for verifying SNMP credentials and reachability before or after
    registering a server. Tries the actual SNMP poll and returns
    system info on success or error details on failure.
    """
    if server_id not in _servers:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")

    srv = _servers[server_id]
    server_info = srv.model_dump()

    start = time_module.monotonic()

    try:
        result = poller._poll_server_snmp(server_info)
        elapsed = (time_module.monotonic() - start) * 1000

        if result is None:
            # easysnmp not installed — try a basic socket check instead
            import socket
            try:
                sock = socket.create_connection(
                    (server_info.get("host", srv.host), server_info.get("port", 161)),
                    timeout=5,
                )
                sock.close()
                return TestConnectionResult(
                    success=True,
                    message=f"Port {server_info.get('port', 161)} is open on {server_info.get('host', srv.host)}",
                    duration_ms=round(elapsed, 1),
                )
            except Exception as sock_err:
                return TestConnectionResult(
                    success=False,
                    message=f"Cannot reach {server_info.get('host', srv.host)}:{server_info.get('port', 161)}",
                    duration_ms=round(elapsed, 1),
                    error=str(sock_err),
                )

        return TestConnectionResult(
            success=True,
            message=f"SNMP connected successfully to {result.get('server', srv.name)}",
            sys_name=result.get("server"),
            uptime_seconds=result.get("uptime_seconds"),
            duration_ms=round(elapsed, 1),
        )
    except Exception as exc:
        elapsed = (time_module.monotonic() - start) * 1000
        return TestConnectionResult(
            success=False,
            message=f"SNMP connection failed: {exc}",
            duration_ms=round(elapsed, 1),
            error=str(exc),
        )


@router.post("/bulk-import", response_model=BulkImportResponse, status_code=201)
async def bulk_import_servers(data: BulkImportRequest):
    """Register multiple servers at once from a JSON array.

    Returns a detailed result for each server, allowing partial success.
    When `skip_duplicates` is true, existing servers are skipped without error.
    """
    results: list[BulkImportResult] = []
    created_count = 0
    skipped_count = 0
    error_count = 0

    for srv in data.servers:
        try:
            if srv.id in _servers:
                if data.skip_duplicates:
                    results.append(BulkImportResult(
                        id=srv.id, name=srv.name, status="skipped",
                        error="Already registered",
                    ))
                    skipped_count += 1
                else:
                    results.append(BulkImportResult(
                        id=srv.id, name=srv.name, status="error",
                        error="Duplicate — already registered",
                    ))
                    error_count += 1
                continue

            server = ServerResponse(
                id=srv.id,
                name=srv.name,
                host=srv.host,
                port=srv.port,
                snmp_version=srv.snmp_version,
                snmp_community=srv.snmp_community,
                snmp_username=srv.snmp_username,
                snmp_auth_protocol=srv.snmp_auth_protocol,
                snmp_auth_password=srv.snmp_auth_password,
                snmp_priv_protocol=srv.snmp_priv_protocol,
                snmp_priv_password=srv.snmp_priv_password,
                status=ServerStatus.UNKNOWN,
                tags=srv.tags,
            )
            _servers[srv.id] = server
            poller.register_server(srv.model_dump())

            results.append(BulkImportResult(
                id=srv.id, name=srv.name, status="created",
            ))
            created_count += 1
        except Exception as exc:
            results.append(BulkImportResult(
                id=srv.id, name=srv.name, status="error",
                error=str(exc),
            ))
            error_count += 1

    return BulkImportResponse(
        total=len(data.servers),
        created=created_count,
        skipped=skipped_count,
        errors=error_count,
        results=results,
    )


@router.get("/export", response_model=list[ServerCreate])
async def export_servers():
    """Export all registered servers as a JSON array suitable for re-import.

    Returns the same format expected by POST /api/servers/bulk-import.
    Passwords are excluded from the export for security.
    """
    exported = []
    for srv in _servers.values():
        exported.append(ServerCreate(
            id=srv.id,
            name=srv.name,
            host=srv.host,
            port=srv.port,
            snmp_version=srv.snmp_version,
            snmp_community=srv.snmp_community,
            snmp_username=srv.snmp_username,
            snmp_auth_protocol=srv.snmp_auth_protocol,
            snmp_priv_protocol=srv.snmp_priv_protocol,
            tags=srv.tags,
            # Passwords excluded for security
        ))
    return exported


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
                snmp_username=srv.snmp_username,
                snmp_auth_protocol=srv.snmp_auth_protocol,
                snmp_auth_password=srv.snmp_auth_password,
                snmp_priv_protocol=srv.snmp_priv_protocol,
                snmp_priv_password=srv.snmp_priv_password,
                status=ServerStatus.ONLINE,
                tags={"environment": "development", "type": srv.id.split("-")[0]},
                created_at=datetime.utcnow(),
            )
            _servers[srv.id] = server
            poller.register_server(srv.model_dump())
