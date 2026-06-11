"""HTTP client for the Dograh AI voice agent API."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import get_config

logger = logging.getLogger(__name__)


class DograhClient:
    """Thin wrapper around the Dograh AI HTTP API."""

    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        cfg = get_config()
        self.base_url = (base_url or cfg.dograh_base_url).rstrip("/")
        self.api_key = api_key or cfg.dograh_api_key
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=cfg.dograh_headers,
            timeout=15.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    # ── Calls ─────────────────────────────────────────────────────────────────

    async def trigger_outbound_call(self, payload: dict) -> Optional[dict]:
        """Trigger an outbound call from Dograh AI.

        Expects at minimum:
            to: str          — target phone number (E.164)
            from: str        — caller ID number
            agent_id: str    — which voice agent to use
            context: dict    — data to pass to the agent (e.g. lead info)
        """
        try:
            resp = await self._client.post("/api/calls/outbound", json=payload)
            if resp.status_code in (200, 201):
                data = resp.json()
                logger.info("Outbound call triggered: %s", data.get("call_id"))
                return data
            logger.warning("Dograh outbound call returned %s: %s", resp.status_code, resp.text[:200])
            return None
        except httpx.RequestError as exc:
            logger.warning("Dograh outbound call failed: %s", exc)
            return None

    async def get_call_status(self, call_id: str) -> Optional[dict]:
        """Check the status of a call."""
        try:
            resp = await self._client.get(f"/api/calls/{call_id}")
            if resp.status_code == 200:
                return resp.json()
            return None
        except httpx.RequestError as exc:
            logger.warning("Dograh get call status failed: %s", exc)
            return None

    async def get_call_transcript(self, call_id: str) -> Optional[str]:
        """Fetch the transcript for a completed call."""
        try:
            resp = await self._client.get(f"/api/calls/{call_id}/transcript")
            if resp.status_code == 200:
                data = resp.json()
                return data.get("transcript") or data.get("text")
            return None
        except httpx.RequestError as exc:
            logger.warning("Dograh get transcript failed: %s", exc)
            return None

    # ── Agents ────────────────────────────────────────────────────────────────

    async def list_agents(self) -> list[dict]:
        """List available voice agents."""
        try:
            resp = await self._client.get("/api/agents")
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else data.get("agents", [])
            return []
        except httpx.RequestError as exc:
            logger.warning("Dograh list agents failed: %s", exc)
            return []

    # ── Health ────────────────────────────────────────────────────────────────

    async def health(self) -> bool:
        """Check if Dograh AI is reachable."""
        try:
            resp = await self._client.get("/health")
            return resp.status_code == 200
        except httpx.RequestError:
            return False
