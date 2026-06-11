"""Application configuration via environment variables."""

from __future__ import annotations

import os
from functools import lru_cache


@lru_cache
def get_config() -> "Config":
    return Config()


class Config:
    """Configuration loaded from environment variables."""

    def __init__(self) -> None:
        # ── Server ────────────────────────────────────────────────────────────
        self.host: str = os.getenv("HOST", "0.0.0.0")
        self.port: int = int(os.getenv("PORT", "8100"))
        self.debug: bool = os.getenv("DEBUG", "false").lower() == "true"
        self.log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

        # ── Dograh AI ─────────────────────────────────────────────────────────
        self.dograh_base_url: str = os.getenv("DOGRAH_BASE_URL", "http://dograh:3010")
        self.dograh_api_key: str = os.getenv("DOGRAH_API_KEY", "")

        # ── CRM ───────────────────────────────────────────────────────────────
        self.crm_base_url: str = os.getenv("CRM_BASE_URL", "http://crm:8000")
        self.crm_api_key: str = os.getenv("CRM_API_KEY", "")

        # ── Outbound Calling Defaults ──────────────────────────────────────────
        self.default_from_number: str = os.getenv("DEFAULT_FROM_NUMBER", "+15551234567")
        self.default_agent_id: str = os.getenv("DEFAULT_AGENT_ID", "agent-qualification")

    @property
    def dograh_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.dograh_api_key:
            headers["Authorization"] = f"Bearer {self.dograh_api_key}"
        return headers

    @property
    def crm_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.crm_api_key:
            headers["X-API-Key"] = self.crm_api_key
        return headers
