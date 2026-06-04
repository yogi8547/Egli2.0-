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

class SNMPAuthProtocol(str, Enum):
    MD5 = "MD5"
    SHA = "SHA"

class SNMPPrivProtocol(str, Enum):
    DES = "DES"
    AES = "AES"


class ServerBase(BaseModel):
    """Core server identity."""
    id: str = Field(..., description="Unique server hostname or IP")
    name: str = Field(..., description="Display name")
    host: str = Field(..., description="SNMP host address")
    port: int = Field(default=161, description="SNMP port")
    snmp_version: str = Field(default="2c", description="SNMP version (2c or 3)")
    snmp_community: str = Field(default="public", description="SNMP community string (v2c)")
    # SNMPv3 auth fields
    snmp_username: Optional[str] = Field(default=None, description="SNMPv3 username")
    snmp_auth_protocol: Optional[SNMPAuthProtocol] = Field(default=None, description="SNMPv3 auth protocol (MD5 or SHA)")
    snmp_auth_password: Optional[str] = Field(default=None, description="SNMPv3 auth password")
    snmp_priv_protocol: Optional[SNMPPrivProtocol] = Field(default=None, description="SNMPv3 privacy protocol (DES or AES)")
    snmp_priv_password: Optional[str] = Field(default=None, description="SNMPv3 privacy password")


class ServerCreate(ServerBase):
    """Request: register a new server to monitor."""
    tags: dict[str, str] = Field(default_factory=dict)
    custom_checks: list[CustomCheckConfig] = Field(default_factory=list, description="Per-server custom checks")

class ServerUpdate(BaseModel):
    """Request: update an existing server's registration details.
    All fields are optional — only provided fields will be updated.
    """
    name: Optional[str] = Field(default=None, description="Display name")
    host: Optional[str] = Field(default=None, description="SNMP host address")
    port: Optional[int] = Field(default=None, description="SNMP port")
    snmp_version: Optional[str] = Field(default=None, description="SNMP version (2c or 3)")
    snmp_community: Optional[str] = Field(default=None, description="SNMP community string (v2c)")
    snmp_username: Optional[str] = Field(default=None, description="SNMPv3 username")
    snmp_auth_protocol: Optional[SNMPAuthProtocol] = Field(default=None, description="SNMPv3 auth protocol (MD5 or SHA)")
    snmp_auth_password: Optional[str] = Field(default=None, description="SNMPv3 auth password")
    snmp_priv_protocol: Optional[SNMPPrivProtocol] = Field(default=None, description="SNMPv3 privacy protocol (DES or AES)")
    snmp_priv_password: Optional[str] = Field(default=None, description="SNMPv3 privacy password")
    tags: Optional[dict[str, str]] = Field(default=None, description="Server tags")
    custom_checks: Optional[list[CustomCheckConfig]] = Field(default=None, description="Custom checks to overwrite")


class ServerResponse(ServerBase):
    """Response: server info with computed status."""
    status: ServerStatus = ServerStatus.UNKNOWN
    tags: dict[str, str] = Field(default_factory=dict)
    custom_checks: list[CustomCheckConfig] = Field(default_factory=list, description="Per-server custom checks")
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True

class ServerListResponse(BaseModel):
    """Response: list of servers."""
    servers: list[ServerResponse]
    total: int

class BulkImportRequest(BaseModel):
    """Request: bulk import multiple servers at once."""
    servers: list[ServerCreate] = Field(..., description="Array of server registration objects")
    skip_duplicates: bool = Field(default=False, description="Skip servers that already exist instead of failing")

class BulkImportResult(BaseModel):
    """Result for a single server in a bulk import."""
    id: str = Field(..., description="Server ID")
    name: str = Field(..., description="Server display name")
    status: str = Field(..., description="'created' or 'skipped' or 'error'")
    error: Optional[str] = Field(default=None, description="Error message if status is 'error'")

class BulkImportResponse(BaseModel):
    """Response: bulk import results."""
    total: int = Field(..., description="Total servers in request")
    created: int = Field(..., description="Number of servers successfully registered")
    skipped: int = Field(..., description="Number of servers skipped (duplicates)")
    errors: int = Field(..., description="Number of servers that failed")
    results: list[BulkImportResult] = Field(..., description="Per-server result details")

class TestConnectionResult(BaseModel):
    """Response: result of a manual SNMP connection test."""
    success: bool = Field(..., description="Whether the SNMP connection succeeded")
    message: str = Field(..., description="Human-readable result message")
    sys_name: Optional[str] = Field(default=None, description="Remote system name (if connected)")
    uptime_seconds: Optional[float] = Field(default=None, description="System uptime (if connected)")
    duration_ms: float = Field(..., description="Time taken for the test in milliseconds")
    error: Optional[str] = Field(default=None, description="Error details if failed")

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

class CustomCheckConfig(BaseModel):
    """Configuration for a single custom check on a server."""
    name: str = Field(..., description="Check name (e.g. 'tomcat', 'opensip')")
    check_type: str = Field(..., description="tcp_port | http | process | custom_snmp | script")
    target: Optional[str] = Field(default=None, description="Target hostname/IP (defaults to server host)")
    port: Optional[int] = Field(default=None, description="TCP port for tcp_port checks (e.g. 8080 for Tomcat)")
    url: Optional[str] = Field(default=None, description="URL for http checks (e.g. http://host:8080/health)")
    expect_status: Optional[int] = Field(default=200, description="Expected HTTP status for http checks")
    process_name: Optional[str] = Field(default=None, description="Process name for process checks")
    oid: Optional[str] = Field(default=None, description="Custom SNMP OID for custom_snmp checks")
    warn_threshold: Optional[float] = Field(default=None, description="Warning threshold for numeric checks")
    crit_threshold: Optional[float] = Field(default=None, description="Critical threshold for numeric checks")
    interval_seconds: int = Field(default=60, description="Check interval in seconds")
    timeout_seconds: int = Field(default=10, description="Timeout per check attempt")
    tags: dict[str, str] = Field(default_factory=dict, description="Optional tags for categorization")


class CustomCheckResult(BaseModel):
    """Result of a single custom check execution."""
    name: str = Field(..., description="Check name")
    check_type: str = Field(..., description="Check type")
    server: str = Field(..., description="Server ID this check ran on")
    success: bool = Field(..., description="Whether the check passed")
    status: str = Field(default="online", description="online | offline | degraded")
    value: Optional[float] = Field(default=None, description="Numeric value if applicable")
    message: str = Field(default="", description="Human-readable result message")
    response_time_ms: float = Field(default=0.0, description="Check duration in milliseconds")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    error: Optional[str] = Field(default=None, description="Error details if check failed")


class ServerChecksResponse(BaseModel):
    """Response: custom check results for a server."""
    server: str
    checks: list[CustomCheckResult]
    total: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "1.0.0"
    uptime_seconds: float = 0.0
    influxdb_connected: bool = False
    ollama_connected: bool = False
    vector_cache_stats: Optional[dict[str, Any]] = Field(default=None, description="AI remediation cache performance stats (total_requests, cache_hit_rate, etc.)")
