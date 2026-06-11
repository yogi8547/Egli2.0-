"""HTTP client for the CRM API (the service being built)."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import get_config

logger = logging.getLogger(__name__)


class CRMClient:
    """Thin wrapper around the Realty CRM HTTP API."""

    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        cfg = get_config()
        self.base_url = (base_url or cfg.crm_base_url).rstrip("/")
        self.api_key = api_key or cfg.crm_api_key
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=cfg.crm_headers,
            timeout=15.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    # ── Contacts ──────────────────────────────────────────────────────────────

    async def search_contact(self, phone: str) -> Optional[dict]:
        """Look up a contact by phone number."""
        try:
            resp = await self._client.get("/api/contacts", params={"phone": phone})
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, dict) and data.get("id") else None
            return None
        except httpx.RequestError as exc:
            logger.warning("CRM contact search failed: %s", exc)
            return None

    async def create_contact(self, payload: dict) -> Optional[dict]:
        """Create a new contact."""
        try:
            resp = await self._client.post("/api/contacts", json=payload)
            if resp.status_code in (200, 201):
                return resp.json()
            logger.warning("CRM create contact returned %s: %s", resp.status_code, resp.text[:200])
            return None
        except httpx.RequestError as exc:
            logger.warning("CRM create contact failed: %s", exc)
            return None

    async def update_contact(self, contact_id: str, payload: dict) -> Optional[dict]:
        """Update an existing contact."""
        try:
            resp = await self._client.put(f"/api/contacts/{contact_id}", json=payload)
            if resp.status_code == 200:
                return resp.json()
            logger.warning("CRM update contact returned %s: %s", resp.status_code, resp.text[:200])
            return None
        except httpx.RequestError as exc:
            logger.warning("CRM update contact failed: %s", exc)
            return None

    # ── Leads ─────────────────────────────────────────────────────────────────

    async def create_lead(self, payload: dict) -> Optional[dict]:
        """Create a new lead."""
        try:
            resp = await self._client.post("/api/leads", json=payload)
            if resp.status_code in (200, 201):
                return resp.json()
            logger.warning("CRM create lead returned %s: %s", resp.status_code, resp.text[:200])
            return None
        except httpx.RequestError as exc:
            logger.warning("CRM create lead failed: %s", exc)
            return None

    async def update_lead_stage(self, lead_id: str, stage: str, reason: str | None = None) -> bool:
        """Update the stage of an existing lead."""
        payload = {"stage": stage}
        if reason:
            payload["reason"] = reason
        try:
            resp = await self._client.put(f"/api/leads/{lead_id}/stage", json=payload)
            return resp.status_code == 200
        except httpx.RequestError as exc:
            logger.warning("CRM update lead stage failed: %s", exc)
            return False

    # ── Activities ─────────────────────────────────────────────────────────────

    async def log_activity(self, payload: dict) -> Optional[dict]:
        """Log a call activity (transcript, summary, recording) against a contact."""
        try:
            resp = await self._client.post("/api/activities", json=payload)
            if resp.status_code in (200, 201):
                return resp.json()
            logger.warning("CRM log activity returned %s: %s", resp.status_code, resp.text[:200])
            return None
        except httpx.RequestError as exc:
            logger.warning("CRM log activity failed: %s", exc)
            return None

    # ── Properties ────────────────────────────────────────────────────────────

    async def search_properties(self, params: dict) -> list[dict]:
        """Search for properties by address, MLS ID, city, or zip."""
        try:
            resp = await self._client.get("/api/properties", params=params)
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else data.get("properties", [])
            return []
        except httpx.RequestError as exc:
            logger.warning("CRM property search failed: %s", exc)
            return []
