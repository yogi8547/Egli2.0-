"""
Anomaly Detector — statistical anomaly detection that learns normal
baselines per server and flags deviations beyond expected ranges.

Features:
- Rolling average and standard deviation for each server+metric
- Time-of-day aware baselines (separate stats for each hour)
- Z-score based anomaly flagging
- Grace period to avoid alert storms
- Works with streaming data and periodic snapshots

Usage:
    from app.services.anomaly_detector import anomaly_detector
    anomalies = anomaly_detector.evaluate(snapshot)
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

from loguru import logger


class MetricBaseline:
    """
    Statistical baseline for a single metric on a single server.
    Maintains a sliding window of recent values and computes
    mean/stddev for anomaly detection.
    """

    def __init__(self, window_size: int = 30, z_score_threshold: float = 2.5):
        self.window_size = window_size
        self.z_score_threshold = z_score_threshold
        self.values: list[float] = []
        self.mean: float = 0.0
        self.stddev: float = 0.0
        self.anomaly_count: int = 0
        self.baseline_established: bool = False

    def update(self, value: float) -> Optional[dict[str, Any]]:
        """
        Add a new observation and check if it's anomalous.

        Args:
            value: New metric value

        Returns:
            Anomaly info dict if anomalous, None otherwise
        """
        self.values.append(value)

        # Keep window size bounded
        if len(self.values) > self.window_size:
            self.values.pop(0)

        # Need minimum samples for a baseline
        if len(self.values) < 5:
            return None

        # Compute stats
        self.mean = statistics.mean(self.values)
        self.stddev = statistics.stdev(self.values) if len(self.values) > 1 else 0.0
        self.baseline_established = True

        # Check z-score
        if self.stddev > 0:
            z_score = abs(value - self.mean) / self.stddev
            if z_score > self.z_score_threshold:
                self.anomaly_count += 1
                direction = "high" if value > self.mean else "low"
                severity = "critical" if z_score > 4.0 else "warning"

                return {
                    "z_score": round(z_score, 2),
                    "direction": direction,
                    "severity": severity,
                    "expected_range": (
                        round(self.mean - 2 * self.stddev, 1),
                        round(self.mean + 2 * self.stddev, 1),
                    ),
                    "current_value": round(value, 1),
                    "baseline_mean": round(self.mean, 1),
                    "baseline_stddev": round(self.stddev, 2),
                    "sample_size": len(self.values),
                }

        return None


class AnomalyDetector:
    """
    Detects anomalies in infrastructure metrics using statistical baselines.
    Separates baselines by server, metric, and hour-of-day for
    time-aware anomaly detection.
    """

    def __init__(self):
        # Key: server:metric:hour, Value: MetricBaseline
        self._baselines: dict[str, MetricBaseline] = {}
        # Key: server:metric, Value: last anomaly time (cooldown)
        self._cooldowns: dict[str, datetime] = {}
        self._cooldown_minutes: float = 15.0
        self._anomaly_log: list[dict[str, Any]] = []
        self._max_log_size: int = 200

    def _get_baseline(self, server: str, metric: str, hour: int) -> MetricBaseline:
        """Get or create a baseline for a specific server+metric+hour."""
        key = f"{server}:{metric}:{hour}"
        if key not in self._baselines:
            self._baselines[key] = MetricBaseline()
        return self._baselines[key]

    def evaluate(self, snapshot: dict) -> list[dict[str, Any]]:
        """
        Evaluate a metric snapshot for anomalies.

        Args:
            snapshot: Metric snapshot dict from the poller

        Returns:
            List of anomaly dicts (empty if none detected)
        """
        server = snapshot.get("server", "unknown")
        now = datetime.utcnow()
        hour = now.hour
        anomalies: list[dict[str, Any]] = []

        metrics_to_check = [
            ("cpu_percent", 0, 100),
            ("memory_percent", 0, 100),
            ("disk_percent", 0, 100),
        ]

        for metric_name, min_val, max_val in metrics_to_check:
            value = snapshot.get(metric_name)
            if value is None:
                continue

            # Update baseline
            baseline = self._get_baseline(server, metric_name, hour)
            result = baseline.update(value)

            if result:
                # Check cooldown
                cooldown_key = f"{server}:{metric_name}"
                if cooldown_key in self._cooldowns:
                    if datetime.utcnow() < self._cooldowns[cooldown_key]:
                        continue  # Skip — still in cooldown

                # Check if value is within acceptable range
                if result["current_value"] < min_val or result["current_value"] > max_val:
                    continue  # Skip obviously out-of-range values (probably stale data)

                anomaly = {
                    "server": server,
                    "metric": metric_name,
                    "timestamp": now.isoformat(),
                    **result,
                }
                anomalies.append(anomaly)

                # Set cooldown
                self._cooldowns[cooldown_key] = now

        # Log anomalies (keep bounded)
        for a in anomalies:
            self._anomaly_log.append(a)
            logger.warning(
                "Anomaly detected: {} on {} — value={}, expected range={} (z={})",
                a["metric"], a["server"], a["current_value"],
                a["expected_range"], a["z_score"],
            )

        if len(self._anomaly_log) > self._max_log_size:
            self._anomaly_log = self._anomaly_log[-self._max_log_size:]

        return anomalies

    def get_recent_anomalies(
        self,
        server: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get recent anomaly detections."""
        results = self._anomaly_log
        if server:
            results = [a for a in results if a["server"] == server]
        return results[-limit:]

    def get_baseline_stats(self) -> list[dict[str, Any]]:
        """Get statistics for all established baselines."""
        stats = []
        for key, baseline in self._baselines.items():
            if baseline.baseline_established:
                server, metric, hour = key.split(":")
                stats.append({
                    "server": server,
                    "metric": metric,
                    "hour": int(hour),
                    "mean": round(baseline.mean, 1),
                    "stddev": round(baseline.stddev, 2),
                    "sample_size": len(baseline.values),
                    "anomalies_detected": baseline.anomaly_count,
                })
        return stats

    def get_summary(self) -> dict[str, Any]:
        """Get a summary of anomaly detection status."""
        total_baselines = sum(
            1 for b in self._baselines.values() if b.baseline_established
        )
        total_anomalies = len(self._anomaly_log)
        recent_anomalies = len([
            a for a in self._anomaly_log
            if (datetime.utcnow() - datetime.fromisoformat(a["timestamp"])).total_seconds() < 3600
        ])

        return {
            "total_baselines": total_baselines,
            "total_anomalies_detected": total_anomalies,
            "anomalies_last_hour": recent_anomalies,
            "metrics_tracked": ["cpu_percent", "memory_percent", "disk_percent"],
        }


# Singleton
anomaly_detector = AnomalyDetector()
