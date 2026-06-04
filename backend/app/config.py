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

    # ── Custom Checks ────────────────────────────────────────────────────
    check_timeout_seconds: int = Field(default=10, alias="CHECK_TIMEOUT_SECONDS", description="Default timeout for custom service checks (TCP/HTTP)")
    check_concurrency: int = Field(default=10, alias="CHECK_CONCURRENCY", description="Max concurrent custom checks to run")
    check_interval_seconds: int = Field(default=60, alias="CHECK_INTERVAL_SECONDS", description="Default interval between custom check runs")

    # ── Qdrant Vector DB ────────────────────────────────────────────────────
    qdrant_url: str = Field(default="http://localhost:6333", alias="QDRANT_URL", description="Qdrant vector DB URL")
    qdrant_collection_alerts: str = Field(default="egli2_alerts", alias="QDRANT_COLLECTION_ALERTS", description="Qdrant collection name for alert embeddings")
    qdrant_vector_size: int = Field(default=768, alias="QDRANT_VECTOR_SIZE", description="Embedding vector dimension (768 for nomic-embed-text, 384 for all-MiniLM-L6-v2)")
    qdrant_reindex_on_start: bool = Field(default=True, alias="QDRANT_REINDEX_ON_START", description="Re-embed existing alerts on startup")
    
    # ── RAG Cache Thresholds ───────────────────────────────────────────────
    vector_cache_high_threshold: float = Field(
        default=0.85, alias="VECTOR_CACHE_HIGH_THRESHOLD",
        description="Cosine similarity score above which cached remediation is returned directly (0.0-1.0)",
        ge=0.0, le=1.0,
    )
    vector_cache_medium_threshold: float = Field(
        default=0.55, alias="VECTOR_CACHE_MEDIUM_THRESHOLD",
        description="Cosine similarity score above which past remediation is used as RAG context (0.0-1.0)",
        ge=0.0, le=1.0,
    )
    vector_cache_min_score: float = Field(
        default=0.4, alias="VECTOR_CACHE_MIN_SCORE",
        description="Minimum cosine similarity for vector search results to be considered (0.0-1.0)",
        ge=0.0, le=1.0,
    )
    vector_cache_top_k: int = Field(
        default=3, alias="VECTOR_CACHE_TOP_K",
        description="Maximum number of search results to retrieve from vector cache (top-k)",
        ge=1, le=50,
    )

    # ── Embedding ──────────────────────────────────────────────────────────
    embedding_model: str = Field(default="nomic-embed-text", alias="EMBEDDING_MODEL", description="Ollama model to use for embeddings")

    # ── CORS ─────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    # ── Mock Data ────────────────────────────────────────────────────────
    seed_mock_data: bool = True
    mock_server_count: int = 5


settings = Settings()
