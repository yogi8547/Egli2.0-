"""Pydantic models for the Dograh ⟷ CRM bridge API."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────────

class CallDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class CallOutcome(str, Enum):
    ANSWERED = "answered"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    FAILED = "failed"
    VOICEMAIL = "voicemail"


class LeadStage(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    DISQUALIFIED = "disqualified"
    FOLLOW_UP = "follow_up"


# ── MCP Tool Request/Response Models ───────────────────────────────────────────

class MCPToolRequest(BaseModel):
    """Generic request from Dograh AI MCP tool call."""
    tool: str
    args: dict = Field(default_factory=dict)
    call_id: Optional[str] = None
    context: dict = Field(default_factory=dict)


class MCPToolResponse(BaseModel):
    """Generic response back to Dograh AI."""
    success: bool = True
    data: Optional[dict] = None
    error: Optional[str] = None


# ── Contact Models ─────────────────────────────────────────────────────────────

class ContactSearchRequest(BaseModel):
    phone: str = Field(..., description="Phone number to search for (E.164 format)")
    name: Optional[str] = None


class ContactCreateRequest(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    source: str = "dograh_inbound_call"
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)


class ContactResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


# ── Lead Models ────────────────────────────────────────────────────────────────

class LeadCreateRequest(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    property_interest: Optional[str] = None
    budget_range: Optional[str] = None
    source: str = "dograh_phone_call"
    notes: Optional[str] = None


class LeadResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    stage: LeadStage = LeadStage.NEW
    property_interest: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeadStageUpdateRequest(BaseModel):
    stage: LeadStage
    reason: Optional[str] = None


# ── Activity / Call Log Models ─────────────────────────────────────────────────

class CallActivityLog(BaseModel):
    contact_id: str
    direction: CallDirection
    outcome: CallOutcome
    duration_seconds: Optional[int] = None
    recording_url: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    sentiment: Optional[str] = None
    follow_up_scheduled: Optional[datetime] = None
    metadata: dict = Field(default_factory=dict)


class ActivityResponse(BaseModel):
    id: str
    contact_id: str
    activity_type: str
    description: str
    created_at: datetime


# ── Property Models ────────────────────────────────────────────────────────────

class PropertySearchRequest(BaseModel):
    address: Optional[str] = None
    mls_id: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None


class PropertyResponse(BaseModel):
    id: str
    address: str
    city: str
    state: str
    zip_code: str
    price: float
    bedrooms: int
    bathrooms: float
    square_feet: int
    property_type: str
    status: str  # active, pending, sold
    mls_id: Optional[str] = None
    description: Optional[str] = None
    listed_at: Optional[datetime] = None


# ── Outbound Call Models ───────────────────────────────────────────────────────

class OutboundCallRequest(BaseModel):
    to: str = Field(..., description="Phone number to call (E.164)")
    from_: str = Field(..., alias="from", description="Caller ID number")
    agent_id: str = "agent-qualification"
    context: dict = Field(default_factory=dict, description="Pass lead/contact data to the agent")


class OutboundCallResponse(BaseModel):
    call_id: str
    status: str  # queued, ringing, connected, failed


# ── Webhook Models ─────────────────────────────────────────────────────────────

class CRMWebhookPayload(BaseModel):
    event: str  # e.g. "lead.created", "task.due"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: dict = Field(default_factory=dict)


class DograhCallbackPayload(BaseModel):
    event: str  # e.g. "call.completed"
    call_id: str
    data: dict = Field(default_factory=dict)
