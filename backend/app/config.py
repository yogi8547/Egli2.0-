"""
Application configuration loaded from environment variables.

All settings are configurable via .env or docker-compose environment.
Sensitive values (passwords, community strings) are marked as SecretStr.
"""

from __future__ import annotations

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings, loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── General ──────────────────────────────────────────────────────────
    app_name: str = "Egli2.0"
    debug: bool = False
    log_level: str = "INFO"
    secret_key: SecretStr = Field(default="change-me-in-production", alias="SECRET_KEY")

    # ── Server ───────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    # ── InfluxDB ─────────────────────────────────────────────────────────
    influxdb_url: str = "http://influxdb:8086"
    influxdb_token: str = "admin-token"
    influxdb_org: str = "monitoring"
    influxdb_bucket: str = "metrics"

    # ── SNMP ─────────────────────────────────────────────────────────────
    snmp_community: str = Field(default="public", alias="SNMP_COMMUNITY")
    snmp_version: str = "2c"
    snmp_timeout: int = 5
    snmp_retries: int = 2
    poll_interval_seconds: int = 60

    # ── Ollama ───────────────────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:latest"
    ollama_temperature: float = 0.3

    # ── Alert Thresholds ─────────────────────────────────────────────────
    cpu_warn_threshold: float = 75.0
    cpu_crit_threshold: float = 90.0
    mem_warn_threshold: float = 80.0
    mem_crit_threshold: float = 95.0
    disk_warn_threshold: float = 85.0
    disk_crit_threshold: float = 95.0

    # ── CORS ─────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    # ── Mock Data ────────────────────────────────────────────────────────
    seed_mock_data: bool = True
    mock_server_count: int = 5


settings = Settings()
