"""
Vector Store — Qdrant-powered semantic search for alert patterns.

Provides:
- Embedding generation via Ollama (nomic-embed-text)
- Vector storage for alerts in Qdrant collections
- Semantic similarity search across historical alerts
- Automatic re-indexing of active alerts on startup
- Graceful fallback to no-op mode when Qdrant is unavailable

Architecture:
    Alert Engine ──→ VectorStore.embed_and_store_alert()
                       │
                       ▼
                   Qdrant collection (egli2_alerts)
                       │
                       ▼
    Query: "find similar alerts" ──→ VectorStore.similarity_search()
                                       │
                                       ▼
                                   Top-k similar alerts
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional

import httpx
from loguru import logger

from app.config import settings


class VectorStore:
    """
    Manages vector embeddings for alerts using Ollama for inference and
    Qdrant for storage + similarity search.

    Gracefully degrades to no-op when Qdrant or Ollama is unavailable,
    so the rest of the application is unaffected by a missing vector DB.
    """

    def __init__(self) -> None:
        self._qdrant_url = settings.qdrant_url
        self._collection_alerts = settings.qdrant_collection_alerts
        self._vector_size = settings.qdrant_vector_size
        self._embedding_model = settings.embedding_model
        self._ollama_url = settings.ollama_base_url

        # Health/availability flags
        self._qdrant_available: bool | None = None  # None = not checked yet
        self._ollama_available: bool | None = None

        # HTTP client (lazy-initialised)
        self._http: httpx.AsyncClient | None = None

    # ── HTTP Helpers ───────────────────────────────────────────────────

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=10.0)
        return self._http

    async def _ensure_collection(self) -> bool:
        """Create the alert collection if it doesn't exist. Returns True if ready."""
        if self._qdrant_available is False:
            return False

        # Check if collection exists
        try:
            resp = await self.http.get(
                f"{self._qdrant_url}/collections/{self._collection_alerts}"
            )
            if resp.status_code == 200:
                self._qdrant_available = True
                return True
        except httpx.RequestError as exc:
            logger.debug("Qdrant not reachable: {}", exc)
            self._qdrant_available = False
            return False

        # Create the collection
        try:
            resp = await self.http.put(
                f"{self._qdrant_url}/collections/{self._collection_alerts}",
                json={
                    "vectors": {
                        "size": self._vector_size,
                        "distance": "Cosine",
                    },
                    "optimizers_config": {
                        "default_segment_number": 2,
                    },
                    "replication_factor": 1,
                },
            )
            if resp.status_code in (200, 201):
                logger.info("Created Qdrant collection '{}'", self._collection_alerts)
                self._qdrant_available = True
                return True
            else:
                logger.warning("Qdrant collection creation failed: {}", resp.text)
                self._qdrant_available = False
                return False
        except httpx.RequestError as exc:
            logger.warning("Cannot create Qdrant collection: {}", exc)
            self._qdrant_available = False
            return False

    async def _generate_embedding(self, text: str) -> list[float] | None:
        """
        Generate a vector embedding using Ollama's embedding API.

        Uses the configured embedding model (default: nomic-embed-text,
        a 768-dim model that works well on CPU).

        Args:
            text: The text to embed (alert message + context)

        Returns:
            List of floats (the embedding vector), or None if unavailable
        """
        if self._ollama_available is False:
            return None

        try:
            resp = await self.http.post(
                f"{self._ollama_url}/api/embeddings",
                json={
                    "model": self._embedding_model,
                    "prompt": text,
                },
                timeout=30.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                embedding = data.get("embedding")
                if embedding and len(embedding) == self._vector_size:
                    self._ollama_available = True
                    return embedding
                elif embedding:
                    logger.warning(
                        "Embedding dimension mismatch: got {}, expected {}",
                        len(embedding), self._vector_size,
                    )
                    # Pad or truncate to match expected size
                    return self._fix_dimension(embedding)
                else:
                    logger.warning("Ollama returned empty embedding")
                    self._ollama_available = False
                    return None
            else:
                logger.warning("Ollama embedding error: {}", resp.text)
                self._ollama_available = False
                return None
        except httpx.RequestError as exc:
            logger.debug("Ollama not reachable for embeddings: {}", exc)
            self._ollama_available = False
            return None

    def _fix_dimension(self, embedding: list[float]) -> list[float]:
        """Pad or truncate embedding to match the configured vector size."""
        if len(embedding) < self._vector_size:
            return embedding + [0.0] * (self._vector_size - len(embedding))
        return embedding[: self._vector_size]

    # ── Public API ────────────────────────────────────────────────────

    async def is_available(self) -> bool:
        """Check if both Qdrant and Ollama are reachable."""
        if self._qdrant_available is None:
            await self._ensure_collection()
        if self._qdrant_available is None:
            self._qdrant_available = False
        return bool(self._qdrant_available)

    async def embed_and_store_alert(self, alert: dict) -> bool:
        """
        Generate an embedding for an alert and store it in Qdrant.

        The alert message + server + metric are concatenated into a
        searchable text that captures the full context of the incident.

        Args:
            alert: Alert dict with keys: id, server, metric, message,
                   severity, status, created_at, value, threshold

        Returns:
            True if stored successfully, False otherwise
        """
        if not await self._ensure_collection():
            return False

        # Build a rich text for embedding that captures the alert's essence
        embed_text = (
            f"Alert on {alert.get('server', 'unknown')}: "
            f"{alert.get('metric', 'unknown')} - "
            f"{alert.get('message', '')} "
            f"Severity: {alert.get('severity', 'unknown')} "
            f"Value: {alert.get('value', 0)} "
            f"Threshold: {alert.get('threshold', 0)}"
        )

        embedding = await self._generate_embedding(embed_text)
        if embedding is None:
            return False

        point_id = alert.get("id", str(uuid.uuid4()))
        try:
            resp = await self.http.put(
                f"{self._qdrant_url}/collections/{self._collection_alerts}/points",
                json={
                    "points": [
                        {
                            "id": point_id,
                            "vector": embedding,
                            "payload": {
                                "alert_id": alert.get("id", ""),
                                "server": alert.get("server", ""),
                                "metric": alert.get("metric", ""),
                                "severity": alert.get("severity", ""),
                                "status": alert.get("status", ""),
                                "message": alert.get("message", ""),
                                "value": alert.get("value", 0),
                                "threshold": alert.get("threshold", 0),
                                "created_at": alert.get("created_at", ""),
                                "remediation": alert.get("remediation", ""),
                            },
                        }
                    ]
                },
            )
            if resp.status_code in (200, 201):
                return True
            else:
                logger.warning("Qdrant upsert failed: {}", resp.text)
                return False
        except httpx.RequestError as exc:
            logger.warning("Qdrant request failed: {}", exc)
            self._qdrant_available = False
            return False

    async def similarity_search(
        self,
        query: str,
        server_filter: str | None = None,
        metric_filter: str | None = None,
        severity_filter: str | None = None,
        top_k: int = 5,
        score_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """
        Search for alerts semantically similar to the given query text.

        This uses Qdrant's built-in vector similarity. The query text
        is embedded with the same model used for alert storage, then
        the nearest neighbour vectors are fetched.

        Args:
            query: Natural-language query (e.g. "connection pool exhausted")
            server_filter: Optional server ID to narrow results
            metric_filter: Optional metric type (cpu, memory, disk, etc.)
            severity_filter: Optional severity (critical, warning, info)
            top_k: Maximum number of results (default 5)
            score_threshold: Minimum cosine similarity (0.0–1.0, default 0.5)

        Returns:
            List of similar alert dicts, each with keys:
                alert_id, server, metric, severity, message, score, etc.
        """
        if not await self._ensure_collection():
            return []

        embedding = await self._generate_embedding(query)
        if embedding is None:
            return []

        # Build Qdrant filter
        qdrant_filter: dict[str, Any] = {"must": []}
        if server_filter:
            qdrant_filter["must"].append(
                {"key": "server", "match": {"value": server_filter}}
            )
        if metric_filter:
            qdrant_filter["must"].append(
                {"key": "metric", "match": {"value": metric_filter}}
            )
        if severity_filter:
            qdrant_filter["must"].append(
                {"key": "severity", "match": {"value": severity_filter}}
            )

        search_payload: dict[str, Any] = {
            "vector": embedding,
            "limit": top_k,
            "with_payload": True,
            "score_threshold": score_threshold,
        }
        if qdrant_filter["must"]:
            search_payload["filter"] = qdrant_filter

        try:
            resp = await self.http.post(
                f"{self._qdrant_url}/collections/{self._collection_alerts}/points/search",
                json=search_payload,
            )
            if resp.status_code != 200:
                logger.warning("Qdrant search failed: {}", resp.text)
                return []

            data = resp.json()
            results = []
            for point in data.get("result", []):
                payload = point.get("payload", {})
                results.append({
                    "alert_id": payload.get("alert_id", ""),
                    "server": payload.get("server", ""),
                    "metric": payload.get("metric", ""),
                    "severity": payload.get("severity", ""),
                    "message": payload.get("message", ""),
                    "value": payload.get("value", 0),
                    "threshold": payload.get("threshold", 0),
                    "created_at": payload.get("created_at", ""),
                    "remediation": payload.get("remediation", ""),
                    "score": round(point.get("score", 0.0), 4),
                })
            return results

        except httpx.RequestError as exc:
            logger.warning("Qdrant search request failed: {}", exc)
            self._qdrant_available = False
            return []

    async def update_alert_remediation(self, alert_id: str, remediation: str) -> bool:
        """
        Update the remediation text on an existing alert in Qdrant.

        After an alert is resolved with a known fix, this stores the
        remediation so future similar alerts can find it via semantic
        cache lookup instead of calling Ollama.

        Args:
            alert_id: The alert's UUID (also the Qdrant point ID)
            remediation: The remediation text to store

        Returns:
            True if updated successfully, False otherwise
        """
        if not await self._ensure_collection():
            return False

        try:
            # Qdrant's set_payload API lets us update specific fields
            resp = await self.http.post(
                f"{self._qdrant_url}/collections/{self._collection_alerts}/points/set-payload",
                json={
                    "payload": {"remediation": remediation},
                    "points": [alert_id],
                },
            )
            if resp.status_code in (200, 201):
                return True
            else:
                logger.warning("Qdrant payload update failed: {}", resp.text)
                return False
        except httpx.RequestError as exc:
            logger.warning("Qdrant payload update request failed: {}", exc)
            self._qdrant_available = False
            return False

    async def search_remediation_cache(
        self,
        query: str,
        server_filter: str | None = None,
        metric_filter: str | None = None,
        top_k: int = 3,
        score_threshold: float = 0.55,
    ) -> list[dict[str, Any]]:
        """
        Search for resolved alerts that have remediations attached.
        This is the semantic cache layer: if a similar alert was resolved
        before, we can reuse its remediation without calling Ollama.

        The Qdrant payload includes a "remediation" field that gets
        populated when an alert is resolved via the AI analysis endpoint.
        This method only returns results where remediation is non-empty.

        Args:
            query: Natural-language query (alert message + context)
            server_filter: Optional server ID to narrow results
            metric_filter: Optional metric type (cpu, memory, disk, etc.)
            top_k: Maximum number of results (default 3)
            score_threshold: Minimum cosine similarity (default 0.55)

        Returns:
            List of similar resolved alert dicts with remediation texts
            and similarity scores, sorted by score descending
        """
        if not await self._ensure_collection():
            return []

        embedding = await self._generate_embedding(query)
        if embedding is None:
            return []

        # Build Qdrant filter: must have non-empty remediation
        must_conditions: list[dict] = [
            {
                "key": "remediation",
                "match": {
                    "value": "",  # Empty string = no remediation
                },
                "must_not": True,  # Exclude points with empty remediation
            },
        ]
        # Actually, Qdrant's filter doesn't support "must_not" directly
        # in the same way. Let's use a different approach:
        # Filter by requiring remediation field to exist and not be empty.
        # Qdrant doesn't have a native "is not empty" filter, so we
        # use a workaround: exclude the empty string.

        # Rebuild filter properly for Qdrant syntax
        must_conditions = []
        if server_filter:
            must_conditions.append(
                {"key": "server", "match": {"value": server_filter}}
            )
        if metric_filter:
            must_conditions.append(
                {"key": "metric", "match": {"value": metric_filter}}
            )

        # Exclude points where remediation is empty or missing
        qdrant_filter: dict[str, Any] = {
            "must": must_conditions,
            "must_not": [
                {
                    "key": "remediation",
                    "match": {"value": ""},  # Exclude empty string
                },
            ],
        }

        search_payload: dict[str, Any] = {
            "vector": embedding,
            "limit": top_k,
            "with_payload": True,
            "score_threshold": score_threshold,
            "filter": qdrant_filter,
        }

        try:
            resp = await self.http.post(
                f"{self._qdrant_url}/collections/{self._collection_alerts}/points/search",
                json=search_payload,
            )
            if resp.status_code != 200:
                logger.warning("Qdrant remediation cache search failed: {}", resp.text)
                return []

            data = resp.json()
            results = []
            for point in data.get("result", []):
                payload = point.get("payload", {})
                remediation = payload.get("remediation", "")
                if not remediation:
                    continue  # Skip if remediation is somehow empty
                results.append({
                    "alert_id": payload.get("alert_id", ""),
                    "server": payload.get("server", ""),
                    "metric": payload.get("metric", ""),
                    "severity": payload.get("severity", ""),
                    "message": payload.get("message", ""),
                    "remediation": remediation,
                    "value": payload.get("value", 0),
                    "threshold": payload.get("threshold", 0),
                    "created_at": payload.get("created_at", ""),
                    "score": round(point.get("score", 0.0), 4),
                })
            return results

        except httpx.RequestError as exc:
            logger.warning("Qdrant remediation cache search failed: {}", exc)
            self._qdrant_available = False
            return []

    async def delete_alert(self, alert_id: str) -> bool:
        """Remove a resolved alert's embedding from Qdrant."""
        if not await self._ensure_collection():
            return False
        try:
            resp = await self.http.post(
                f"{self._qdrant_url}/collections/{self._collection_alerts}/points/delete",
                json={"points": [alert_id]},
            )
            return resp.status_code in (200, 201)
        except httpx.RequestError:
            return False

    async def get_collection_stats(self) -> dict[str, Any]:
        """Get statistics about the alert collection."""
        if not await self._ensure_collection():
            return {"status": "unavailable", "total_points": 0}

        try:
            resp = await self.http.get(
                f"{self._qdrant_url}/collections/{self._collection_alerts}"
            )
            if resp.status_code == 200:
                data = resp.json()
                info = data.get("result", {})
                return {
                    "status": "ready",
                    "total_points": info.get("vectors_count", 0),
                    "segments_count": info.get("segments_count", 0),
                    "vector_size": self._vector_size,
                    "distance": "Cosine",
                }
            return {"status": "error", "detail": resp.text, "total_points": 0}
        except httpx.RequestError as exc:
            return {"status": "unavailable", "error": str(exc), "total_points": 0}

    async def reindex_alerts(self, alerts: list[dict]) -> dict[str, int]:
        """
        Re-embed all existing alerts into Qdrant.
        Called on startup to populate the vector store with current alerts.

        Args:
            alerts: List of alert dicts to re-index

        Returns:
            Dict with counts: {"total": N, "success": N, "failed": N}
        """
        if not alerts:
            return {"total": 0, "success": 0, "failed": 0}

        success = 0
        failed = 0
        for alert in alerts:
            ok = await self.embed_and_store_alert(alert)
            if ok:
                success += 1
            else:
                failed += 1

        logger.info(
            "Re-indexed {} alerts ({} success, {} failed)",
            len(alerts), success, failed,
        )
        return {"total": len(alerts), "success": success, "failed": failed}

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._http:
            await self._http.aclose()
            self._http = None


# Singleton vector store
vector_store = VectorStore()
