"""Pydantic data models for the Root Cause Analysis system."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────────────────────

class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AnomalyStatus(str, Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class HypothesisStatus(str, Enum):
    UNRESOLVED = "unresolved"
    CONFIRMED = "confirmed"
    RULED_OUT = "ruled_out"


class HypothesisCategory(str, Enum):
    DEPLOYMENT = "deployment"
    CONFIG_CHANGE = "config_change"
    UPSTREAM_FAILURE = "upstream_failure"
    RESOURCE_EXHAUSTION = "resource_exhaustion"
    BASELINE_SHIFT = "baseline_shift"
    MAINTENANCE = "maintenance"
    CAPACITY = "capacity"
    SOFTWARE_BUG = "software_bug"
    CASCADING_FAILURE = "cascading_failure"
    EXTERNAL = "external"
    UNKNOWN = "unknown"


class EventType(str, Enum):
    DEPLOYMENT = "deployment"
    CONFIG_CHANGE = "config_change"
    MAINTENANCE = "maintenance"
    BASELINE_SHIFT = "baseline_shift"
    SCALING_EVENT = "scaling_event"
    INCIDENT = "incident"
    ROLLBACK = "rollback"
    CUSTOM = "custom"


class TrendDirection(str, Enum):
    GROWING = "growing"
    DECREASING = "decreasing"
    SPIKING = "spiking"
    DROPPING = "dropping"
    FLAT = "flat"
    UNKNOWN = "unknown"


class InvestigationStepStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    IN_PROGRESS = "in_progress"


# ─── Core Data Models ────────────────────────────────────────────────────────

class Component(BaseModel):
    """An infrastructure component that is being monitored."""
    id: str = Field(..., description="Unique identifier for the component")
    name: str = Field(..., description="Human-readable name")
    component_type: str = Field(default="server", description="Type: server, service, database, network, etc.")
    tags: dict[str, str] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Dependency(BaseModel):
    """A dependency relationship between two components."""
    source_id: str = Field(..., description="The dependent component")
    target_id: str = Field(..., description="The dependency component")
    relationship_type: str = Field(default="depends_on", description="Type of relationship")
    metadata: dict[str, Any] = Field(default_factory=dict)


class DependencyGraph(BaseModel):
    """Complete dependency graph for the infrastructure."""
    components: dict[str, Component] = Field(default_factory=dict)
    dependencies: list[Dependency] = Field(default_factory=list)


class Anomaly(BaseModel):
    """A detected anomaly in the infrastructure."""
    id: str = Field(..., description="Unique anomaly identifier")
    component_id: str = Field(..., description="Component where anomaly was detected")
    component_name: str = Field(..., description="Human-readable component name")
    metric_name: str = Field(..., description="The metric that triggered the anomaly")
    metric_value: float = Field(..., description="Current metric value")
    baseline_value: float = Field(..., description="Expected baseline value")
    deviation: float = Field(..., description="Deviation from baseline (absolute or percentage)")
    trend: TrendDirection = Field(default=TrendDirection.UNKNOWN)
    severity: Severity = Field(default=Severity.MEDIUM)
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    status: AnomalyStatus = Field(default=AnomalyStatus.OPEN)
    description: str = Field(default="", description="Human-readable description of the anomaly")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Detection confidence")
    metadata: dict[str, Any] = Field(default_factory=dict)
    resolved_at: Optional[datetime] = None


class InfrastructureEvent(BaseModel):
    """An infrastructure event that may correlate with anomalies."""
    id: str = Field(..., description="Unique event identifier")
    event_type: EventType = Field(..., description="Type of infrastructure event")
    component_id: str = Field(..., description="Affected component")
    description: str = Field(..., description="Human-readable event description")
    timestamp: datetime = Field(..., description="When the event occurred")
    source: str = Field(default="manual", description="Event source system (github_actions, ansible, etc.)")
    details: dict[str, Any] = Field(default_factory=dict)
    operator: Optional[str] = Field(default=None, description="Operator who performed the action")
    severity: Severity = Field(default=Severity.LOW)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
        }


class CorrelationRule(BaseModel):
    """A rule defining how events correlate with anomalies."""
    id: str = Field(..., description="Unique rule identifier")
    name: str = Field(..., description="Human-readable rule name")
    description: str = Field(default="", description="What this rule detects")
    event_type: EventType = Field(..., description="Type of event to correlate")
    time_window_hours: float = Field(default=72.0, description="Lookback window in hours")
    metric_pattern: Optional[str] = Field(default=None, description="Regex for matching metric names")
    hypothesis_template: str = Field(..., description="Template for generating hypothesis text")
    hypothesis_category: HypothesisCategory = Field(default=HypothesisCategory.UNKNOWN)
    priority: int = Field(default=0, description="Rule priority (higher = more important)")
    enabled: bool = Field(default=True)


class Hypothesis(BaseModel):
    """A causal hypothesis explaining an anomaly."""
    id: str = Field(..., description="Unique hypothesis identifier")
    anomaly_id: str = Field(..., description="Anomaly this hypothesis explains")
    rank: int = Field(..., description="Rank by likelihood (1 = most likely)")
    category: HypothesisCategory = Field(default=HypothesisCategory.UNKNOWN)
    title: str = Field(..., description="Short hypothesis title")
    description: str = Field(..., description="Detailed explanation of the hypothesis")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence score (0-1)")
    evidence: list[str] = Field(default_factory=list, description="Supporting evidence items")
    status: HypothesisStatus = Field(default=HypothesisStatus.UNRESOLVED)
    investigation_steps: list[str] = Field(default_factory=list, description="Recommended diagnostic steps")
    correlated_event_ids: list[str] = Field(default_factory=list, description="IDs of correlated events")
    correlated_component_ids: list[str] = Field(default_factory=list, description="IDs of correlated components")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class InvestigationStep(BaseModel):
    """A single diagnostic step in an investigation."""
    id: str = Field(..., description="Unique step identifier")
    hypothesis_id: str = Field(..., description="Parent hypothesis ID")
    anomaly_id: str = Field(..., description="Parent anomaly ID")
    description: str = Field(..., description="What to check or run")
    command: Optional[str] = Field(default=None, description="CLI command to run, if applicable")
    status: InvestigationStepStatus = Field(default=InvestigationStepStatus.PENDING)
    result: Optional[str] = Field(default=None, description="Result of the investigation")
    operator_notes: Optional[str] = Field(default=None, description="Operator annotations")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    order: int = Field(default=0)


class CorrelationResult(BaseModel):
    """Result of correlating an anomaly with other metrics and components."""
    anomaly_id: str = Field(..., description="The anomaly being correlated")
    correlated_components: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Related components with metric shifts",
    )
    correlated_metrics: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Related metrics showing synchronized behavior",
    )
    downstream_impacts: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Predicted downstream effects",
    )
    correlation_score: float = Field(default=0.0, description="Overall correlation strength")


class InvestigationAuditEntry(BaseModel):
    """An entry in the investigation audit trail."""
    anomaly_id: str = Field(..., description="Anomaly being investigated")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    action: str = Field(..., description="Action taken")
    actor: str = Field(default="system", description="Who performed the action")
    details: dict[str, Any] = Field(default_factory=dict)


class Investigation(BaseModel):
    """Complete investigation record for an anomaly."""
    anomaly_id: str = Field(..., description="Anomaly under investigation")
    anomaly: Optional[Anomaly] = Field(default=None)
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    related_events: list[InfrastructureEvent] = Field(default_factory=list)
    correlations: Optional[CorrelationResult] = Field(default=None)
    audit_trail: list[InvestigationAuditEntry] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    resolution_summary: Optional[str] = Field(default=None)


class RCAResult(BaseModel):
    """Complete root cause analysis result for an anomaly."""
    anomaly: Anomaly
    hypotheses: list[Hypothesis]
    related_events: list[InfrastructureEvent]
    correlations: CorrelationResult
    investigation: Investigation
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Configuration Models ────────────────────────────────────────────────────

class RCAConfig(BaseModel):
    """Configuration for the Root Cause Analysis engine."""
    event_lookback_hours: float = Field(default=72.0, description="Hours to look back for correlated events")
    max_hypotheses: int = Field(default=5, description="Maximum hypotheses to generate")
    llm_model: str = Field(default="llama3.2", description="Ollama model for hypothesis generation")
    llm_temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    hypothesis_style: str = Field(default="balanced", description="concise, balanced, or detailed")
    downstream_impact_depth: int = Field(default=2, ge=1, le=10, description="Dependency graph traversal depth")
    default_severity_threshold: float = Field(default=0.5, description="Minimum severity for RCA activation")
    auto_investigate: bool = Field(default=True, description="Automatically start investigation on new anomalies")
    enabled: bool = Field(default=True)


class CustomCorrelationRule(BaseModel):
    """Operator-defined custom correlation rule."""
    name: str = Field(..., description="Rule name")
    description: str = Field(default="")
    event_types: list[EventType] = Field(default_factory=list)
    time_window_hours: float = Field(default=72.0)
    metric_patterns: list[str] = Field(default_factory=list)
    hypothesis_template: str = Field(default="")
    condition_expression: Optional[str] = Field(
        default=None,
        description="Python expression for custom correlation logic",
    )
    priority: int = Field(default=5)
    enabled: bool = Field(default=True)


# ─── API Request/Response Models ─────────────────────────────────────────────

class EventIngestRequest(BaseModel):
    """Request body for ingesting an infrastructure event."""
    event_type: EventType
    component_id: str
    description: str
    timestamp: datetime
    source: str = "manual"
    details: dict[str, Any] = Field(default_factory=dict)
    operator: Optional[str] = None


class BatchEventIngestRequest(BaseModel):
    """Request body for batch event ingestion."""
    events: list[EventIngestRequest]


class HypothesisValidationRequest(BaseModel):
    """Request body for validating a hypothesis."""
    hypothesis_id: str
    status: HypothesisStatus
    operator_notes: Optional[str] = None


class InvestigationStepUpdateRequest(BaseModel):
    """Request body for updating an investigation step."""
    status: InvestigationStepStatus
    result: Optional[str] = None
    operator_notes: Optional[str] = None


class ComponentRegisterRequest(BaseModel):
    """Request body for registering a component."""
    id: str
    name: str
    component_type: str = "server"
    tags: dict[str, str] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    dependencies: list[str] = Field(default_factory=list, description="IDs of components this depends on")


class RCAAnalyzeRequest(BaseModel):
    """Request body for triggering RCA analysis."""
    anomaly_id: str
    force_regenerate: bool = False
