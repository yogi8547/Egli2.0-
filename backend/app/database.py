"""
InfluxDB client management — connection pool, write API, query API.

Auto-detects whether InfluxDB is available. If not (e.g. running outside
Docker), falls back to an in-memory mock database so the application can
run without external dependencies.

All metric data is written as InfluxDB points with tags and fields.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from loguru import logger

from app.config import settings


class InfluxDBManager:
    """
    Manages InfluxDB connection and provides convenience methods.
    Falls back to in-memory storage when InfluxDB is not available.
    """

    def __init__(self) -> None:
        self._client: Any = None
        self._write_api: Any = None
        self._query_api: Any = None
        self._mock_mode: bool = False
        # In-memory storage for mock mode
        self._storage: dict = {}
        self._latest: dict = {}

    def connect(self) -> None:
        """Initialize the InfluxDB client connection with automatic fallback."""
        # Try real InfluxDB first
        real_ok = self._try_connect_real()
        if real_ok:
            return

        # Fall back to mock mode
        self._mock_mode = True
        logger.info(
            "InfluxDB not available at {} — running in mock in-memory mode",
            settings.influxdb_url,
        )

    def _try_connect_real(self) -> bool:
        """Attempt to connect to real InfluxDB. Returns True if successful."""
        try:
            from influxdb_client import InfluxDBClient
            from influxdb_client.client.write_api import SYNCHRONOUS

            self._client = InfluxDBClient(
                url=settings.influxdb_url,
                token=settings.influxdb_token,
                org=settings.influxdb_org,
                timeout=5_000,  # Quick timeout for detection
            )
            self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
            self._query_api = self._client.query_api()

            # Verify connectivity with ping
            if self._client.ping():
                logger.info("Connected to InfluxDB at {}", settings.influxdb_url)
                return True
            else:
                logger.warning("InfluxDB ping failed")
                self._client = None
                return False
        except ImportError:
            logger.info("influxdb-client not installed — using in-memory mock")
            return False
        except Exception as exc:
            logger.debug("InfluxDB connection failed: {}", exc)
            return False

    @property
    def client(self):
        if self._client is None:
            return self  # Return self as mock client
        return self._client

    @property
    def write(self):
        if self._write_api is None:
            return self
        return self._write_api

    @property
    def query(self):
        if self._query_api is None:
            return self
        return self._query_api

    # ── Write Helpers ────────────────────────────────────────────────────

    def write_metric(
        self,
        measurement: str,
        tags: dict[str, str],
        fields: dict[str, Any],
        time: Optional[datetime] = None,
    ) -> None:
        if not self._mock_mode and self._write_api:
            self._write_real(measurement, tags, fields, time)
        else:
            self._write_mock(measurement, tags, fields, time)

    def _write_real(self, measurement, tags, fields, time):
        """Write to real InfluxDB."""
        from influxdb_client import Point
        try:
            point = (
                Point(measurement)
                .tags(tags)
                .fields(fields)
                .time(time or datetime.utcnow())
            )
            self._write_api.write(bucket=settings.influxdb_bucket, record=point)
        except Exception as exc:
            logger.error("Failed to write metric: {}", exc)

    def _write_mock(self, measurement, tags, fields, time):
        """Write to in-memory storage."""
        record = {
            "time": (time or datetime.utcnow()).isoformat(),
            "measurement": measurement,
            "tags": dict(tags),
            "fields": dict(fields),
        }
        if measurement not in self._storage:
            self._storage[measurement] = []
        self._storage[measurement].append(record)

        # Update latest cache
        server = tags.get("server", "unknown")
        cache_key = f"{server}:{measurement}"
        self._latest[cache_key] = record

        # Keep storage bounded
        if len(self._storage[measurement]) > 10000:
            self._storage[measurement] = self._storage[measurement][-5000:]

    def write_metrics_batch(self, points) -> None:
        """Write multiple points in a single batch."""
        if not self._mock_mode and self._write_api:
            from influxdb_client import Point as InfluxPoint
            try:
                # Convert mock points if needed
                real_points = []
                for p in points:
                    if hasattr(p, '_measurement'):
                        # Convert MockPoint to InfluxPoint
                        rp = InfluxPoint(p._measurement)
                        for k, v in p._tags.items():
                            rp.tag(k, v)
                        for k, v in p._fields.items():
                            rp.field(k, v)
                        rp.time(p._time or datetime.utcnow())
                        real_points.append(rp)
                    else:
                        real_points.append(p)
                self._write_api.write(bucket=settings.influxdb_bucket, record=real_points)
            except Exception as exc:
                logger.error("Failed to write batch metrics: {}", exc)
        else:
            for point in points:
                if hasattr(point, '_measurement'):
                    self._write_mock(point._measurement, point._tags, point._fields, point._time)
                elif isinstance(point, dict):
                    self._write_mock(
                        point.get("measurement", "unknown"),
                        point.get("tags", {}),
                        point.get("fields", {}),
                        point.get("time"),
                    )

    # ── Query Helpers ────────────────────────────────────────────────────

    def query_metrics(
        self,
        measurement: str,
        server: Optional[str] = None,
        duration_hours: float = 1.0,
        limit: int = 500,
    ) -> list[dict]:
        if not self._mock_mode and self._query_api:
            return self._query_real(measurement, server, duration_hours, limit)
        return self._query_mock(measurement, server, limit)

    def _query_real(self, measurement, server, duration_hours, limit):
        """Query from real InfluxDB."""
        server_filter = f'|> filter(fn: (r) => r["server"] == "{server}")' if server else ""
        flux = f"""
        from(bucket: "{settings.influxdb_bucket}")
            |> range(start: -{int(duration_hours)}h)
            |> filter(fn: (r) => r["_measurement"] == "{measurement}")
            {server_filter}
            |> sort(desc: true)
            |> limit(n: {limit})
        """
        try:
            tables = self._query_api.query(flux)
            results = []
            for table in tables:
                for record in table.records:
                    results.append({
                        "time": record.get_time().isoformat(),
                        "measurement": record.get_measurement(),
                        "value": record.get_value(),
                        "field": record.get_field(),
                        "server": record.values.get("server", ""),
                    })
            return results
        except Exception as exc:
            logger.error("InfluxDB query failed: {}", exc)
            return []

    def _query_mock(self, measurement, server, limit):
        """Query from in-memory storage."""
        records = self._storage.get(measurement, [])
        if server:
            records = [r for r in records if r["tags"].get("server") == server]
        records = sorted(records, key=lambda r: r["time"], reverse=True)

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
        if not self._mock_mode and self._query_api:
            return self._get_latest_real(server)
        return self._get_latest_mock(server)

    def _get_latest_real(self, server):
        result = {}
        for measurement in ("cpu", "memory", "disk", "network"):
            points = self.query_metrics(measurement, server=server, duration_hours=1, limit=1)
            if points:
                result[measurement] = points[0]
        return result

    def _get_latest_mock(self, server):
        result = {}
        for measurement in ("cpu", "memory", "disk", "network"):
            cache_key = f"{server}:{measurement}"
            record = self._latest.get(cache_key)
            if record:
                fields = record["fields"]
                first_field = list(fields.keys())[0] if fields else ""
                first_value = list(fields.values())[0] if fields else 0
                result[measurement] = {
                    "time": record["time"],
                    "measurement": record["measurement"],
                    "value": first_value,
                    "field": first_field,
                    "server": server,
                }
        return result

    def is_connected(self) -> bool:
        """Check if InfluxDB is reachable (mock is always 'connected')."""
        if self._mock_mode:
            return True
        if self._client is None:
            return False
        try:
            return self._client.ping()
        except Exception:
            return False

    def close(self) -> None:
        """Close the InfluxDB connection and clear mock storage."""
        if not self._mock_mode and self._client:
            try:
                self._client.close()
                logger.info("InfluxDB connection closed")
            except Exception:
                pass
        self._storage.clear()
        self._latest.clear()
        logger.info("Database connection closed")


# Singleton instance
db = InfluxDBManager()
