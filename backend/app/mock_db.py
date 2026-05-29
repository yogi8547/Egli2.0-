"""
Mock In-Memory Database — drop-in replacement for InfluxDBManager.

Stores all metric data in memory (dicts + lists) so the application
can run without Docker / InfluxDB. Supports the same public API as
the real InfluxDBManager for seamless swapping.

Usage:
    from app.mock_db import MockDB
    db = MockDB()
    db.connect()   # No-op, always succeeds
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

from loguru import logger


class _MockPoint:
    """Simulates an InfluxDB Point for batch writes."""
    def __init__(self, measurement: str):
        self._measurement = measurement
        self._tags: dict[str, str] = {}
        self._fields: dict[str, Any] = {}
        self._time: Optional[datetime] = None

    def tag(self, key: str, value: str) -> _MockPoint:
        self._tags[key] = value
        return self

    def field(self, key: str, value: Any) -> _MockPoint:
        self._fields[key] = value
        return self

    def time(self, time: datetime) -> _MockPoint:
        self._time = time
        return self


class MockDB:
    """
    In-memory database that implements the same interface as InfluxDBManager.
    Stores metrics, supports queries, and always returns plausible data.
    """

    def __init__(self):
        self._connected = False
        # Storage: {measurement: [{time, tags, fields}, ...]}
        self._storage: dict[str, list[dict]] = defaultdict(list)
        # Cache of latest metric per server+measurement
        self._latest: dict[str, dict] = {}

    def connect(self) -> None:
        """Always succeeds — no external service needed."""
        self._connected = True
        logger.info("MockDB connected (in-memory mode — no InfluxDB required)")

    @property
    def client(self):
        """Return self as a mock client."""
        if not self._connected:
            raise RuntimeError("MockDB not connected — call connect() first")
        return self

    @property
    def write(self):
        """Return self as a mock write API."""
        if not self._connected:
            raise RuntimeError("MockDB not connected — call connect() first")
        return self

    @property
    def query(self):
        """Return self as a mock query API."""
        if not self._connected:
            raise RuntimeError("MockDB not connected — call connect() first")
        return self

    # ── Write Helpers ────────────────────────────────────────────────────

    def write_metric(
        self,
        measurement: str,
        tags: dict[str, str],
        fields: dict[str, Any],
        time: Optional[datetime] = None,
    ) -> None:
        """Store a metric point in memory."""
        record = {
            "time": (time or datetime.utcnow()).isoformat(),
            "measurement": measurement,
            "tags": dict(tags),
            "fields": dict(fields),
        }
        self._storage[measurement].append(record)
        # Update latest cache
        server = tags.get("server", "unknown")
        cache_key = f"{server}:{measurement}"
        self._latest[cache_key] = record

        # Keep storage bounded (last 10000 points per measurement)
        if len(self._storage[measurement]) > 10000:
            self._storage[measurement] = self._storage[measurement][-5000:]

    def write_metrics_batch(self, points: list) -> None:
        """Write multiple points in a single batch."""
        for point in points:
            if hasattr(point, '_measurement'):
                self.write_metric(
                    measurement=point._measurement,
                    tags=point._tags,
                    fields=point._fields,
                    time=point._time,
                )
            elif isinstance(point, dict):
                self.write_metric(
                    measurement=point.get("measurement", "unknown"),
                    tags=point.get("tags", {}),
                    fields=point.get("fields", {}),
                    time=point.get("time"),
                )

    # ── Query Helpers ────────────────────────────────────────────────────

    def query_metrics(
        self,
        measurement: str,
        server: Optional[str] = None,
        duration_hours: float = 1.0,
        limit: int = 500,
    ) -> list[dict]:
        """Query recent metrics for a measurement from in-memory storage."""
        records = self._storage.get(measurement, [])

        # Filter by server
        if server:
            records = [r for r in records if r["tags"].get("server") == server]

        # Sort by time descending
        records = sorted(records, key=lambda r: r["time"], reverse=True)

        # Convert to InfluxDB-like format
        results = []
        for record in records[:limit]:
            for field_name, field_value in record["fields"].items():
                results.append({
                    "time": record["time"],
                    "measurement": record["measurement"],
                    "value": field_value,
                    "field": field_name,
                    "server": record["tags"].get("server", ""),
                })

        return results

    def get_latest_metrics(self, server: str) -> dict[str, Any]:
        """Get the most recent metrics snapshot for a server."""
        result = {}
        for measurement in ("cpu", "memory", "disk", "network"):
            cache_key = f"{server}:{measurement}"
            record = self._latest.get(cache_key)
            if record:
                result[measurement] = {
                    "time": record["time"],
                    "measurement": record["measurement"],
                    "value": list(record["fields"].values())[0] if record["fields"] else 0,
                    "field": list(record["fields"].keys())[0] if record["fields"] else "",
                    "server": server,
                }
        return result

    def is_connected(self) -> bool:
        """Check if the mock database is 'connected'."""
        return self._connected

    def ping(self) -> bool:
        """Always returns True — no actual ping needed."""
        return True

    def close(self) -> None:
        """Clear all stored data."""
        self._storage.clear()
        self._latest.clear()
        self._connected = False
        logger.info("MockDB connection closed — all data cleared")


# Singleton instance — same import pattern as the real DB
db = MockDB()
