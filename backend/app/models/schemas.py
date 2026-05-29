"""
Shared Pydantic schemas for API requests, responses, and internal models.

Includes Server, Metric, Alert, AI Analysis, and Chat models.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────────────────────

class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

class AlertStatus(str, Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"

class ServerStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"

class MetricType(str, Enum):
    CPU = "cpu"
    MEMORY = "memory"
    DISK = "disk"
    NETWORK = "network"


# ─── Server Models ───────────────────────────────────────────────────────────

class ServerBase(BaseModel):
    """Core server identity."""
    id: str = Field(..., description="Unique server hostname or IP")
    name: str = Field(..., description="Display name")
    host: str = Field(..., description="SNMP host address")
    port: int = Field(default=161, description="SNMP port")
    snmp_version: str = Field(default="2c", description="SNMP version (2c or 3)")
    snmp_community: str = Field(default="public", description="SNMP community string (v2c)")

class ServerCreate(ServerBase):
    """Request: register a new server to monitor."""
    tags: dict[str, str] = Field(default_factory=dict)

class ServerResponse(ServerBase):
    """Response: server info with computed status."""
    status: ServerStatus = ServerStatus.UNKNOWN
    tags: dict[str, str] = Field(default_factory=dict)
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True

class ServerListResponse(BaseModel):
    """Response: list of servers."""
    servers: list[ServerResponse]
    total: int

# ─── Metric Models ───────────────────────────────────────────────────────────

class MetricPoint(BaseModel):
    """A single metric data point."""
    time: str
    measurement: str
    field: str
    value: float
    server: str

class MetricSnapshot(BaseModel):
    """A snapshot of all metrics for a server at a point in time."""
    server: str
    timestamp: str
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    memory_used_gb: float = 0.0
    memory_total_gb: float = 0.0
    disk_percent: float = 0.0
    disk_used_gb: float = 0.0
    disk_total_gb: float = 0.0
    network_rx_bytes: float = 0.0
    network_tx_bytes: float = 0.0
    uptime_seconds: float = 0.0

class MetricsResponse(BaseModel):
    """Response: current metrics for one or more servers."""
    metrics: list[MetricSnapshot]
    total: int

# ─── Alert Models ────────────────────────────────────────────────────────────

class Alert(BaseModel):
    """A triggered alert with metadata."""
    id: str = Field(default="", description="Unique alert ID")
    server: str = Field(..., description="Affected server")
    metric: str = Field(..., description="Metric that triggered the alert")
    value: float = Field(..., description="Current metric value")
    threshold: float = Field(..., description="Threshold that was breached")
    severity: AlertSeverity = Field(default=AlertSeverity.WARNING)
    status: AlertStatus = Field(default=AlertStatus.ACTIVE)
    message: str = Field(..., description="Human-readable alert message")
    remediation: str = Field(default="", description="AI-suggested remediation")
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    resolved_at: Optional[str] = None

class AlertListResponse(BaseModel):
    """Response: list of alerts."""
    alerts: list[Alert]
    total: int
    active_count: int

# ─── AI / Chat Models ────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """Request: send infrastructure data for AI analysis."""
    data: dict[str, Any] = Field(..., description="Infrastructure data to analyze")
    context: Optional[str] = Field(default=None, description="Additional context")

class AnalyzeResponse(BaseModel):
    """Response: AI analysis result."""
    analysis: str = Field(..., description="AI-generated analysis text")
    model: str = Field(default="llama3.2")
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class ChatRequest(BaseModel):
    """Request: natural language query about infrastructure."""
    message: str = Field(..., description="User's natural language query")
    server: Optional[str] = Field(default=None, description="Optional server scope")
    include_metrics: bool = Field(default=True, description="Include current metrics as context")

class ChatResponse(BaseModel):
    """Response: AI answer to natural language query."""
    response: str = Field(..., description="AI-generated answer")
    model: str = Field(default="llama3.2")
    context_used: dict[str, Any] = Field(default_factory=dict)

# ─── Dashboard / Overview Models ─────────────────────────────────────────────

class SystemOverview(BaseModel):
    """Dashboard overview with aggregate stats."""
    total_servers: int = 0
    online_servers: int = 0
    offline_servers: int = 0
    degraded_servers: int = 0
    active_alerts: int = 0
    avg_cpu: float = 0.0
    avg_memory: float = 0.0
    avg_disk: float = 0.0

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "1.0.0"
    uptime_seconds: float = 0.0
    influxdb_connected: bool = False
    ollama_connected: bool = False
