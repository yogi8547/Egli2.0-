"""
Forecaster — predictive analytics for infrastructure metrics.

Uses linear regression on historical data to forecast:
- Days until disk is full (at current growth rate)
- Days until memory exceeds warning/critical thresholds
- CPU trend direction and acceleration

All computation is local — no external ML dependencies.
Uses simple statistics that run efficiently on time-series data.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any, Optional

from loguru import logger


class LinearRegression:
    """
    Simple linear regression (y = mx + b) using least squares.
    All computation is O(n) with constant memory.
    """

    def __init__(self, data: list[tuple[float, float]]):
        """
        Args:
            data: List of (x, y) tuples where x = time (epoch seconds),
                  y = metric value
        """
        self.data = data
        self.slope = 0.0
        self.intercept = 0.0
        self.r_squared = 0.0
        self._fit()

    def _fit(self):
        n = len(self.data)
        if n < 2:
            return

        x_sum = sum(x for x, _ in self.data)
        y_sum = sum(y for _, y in self.data)
        x_mean = x_sum / n
        y_mean = y_sum / n

        num = 0.0
        den = 0.0
        for x, y in self.data:
            num += (x - x_mean) * (y - y_mean)
            den += (x - x_mean) ** 2

        if den == 0:
            self.slope = 0.0
            self.intercept = y_mean
            self.r_squared = 0.0
            return

        self.slope = num / den
        self.intercept = y_mean - self.slope * x_mean

        # R-squared (goodness of fit)
        ss_res = sum((y - (self.slope * x + self.intercept)) ** 2 for x, y in self.data)
        ss_tot = sum((y - y_mean) ** 2 for y in self.data)
        self.r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    def predict(self, x: float) -> float:
        """Predict y value at given x."""
        return self.slope * x + self.intercept

    def predict_at_time(self, dt: datetime) -> float:
        """Predict value at a given datetime."""
        if not self.data:
            return 0.0
        # Use relative time from first data point
        x = dt.timestamp()
        return self.predict(x)


class MetricForecast:
    """
    Forecast result for a single metric on a single server.
    """

    def __init__(
        self,
        server: str,
        metric: str,
        current_value: float,
        trend: str,  # "increasing", "decreasing", "stable"
        slope: float,  # Change per hour
        r_squared: float,
        days_to_warning: Optional[float] = None,
        days_to_critical: Optional[float] = None,
        predicted_7d: Optional[float] = None,
        predicted_30d: Optional[float] = None,
        confidence: str = "low",  # "high", "medium", "low"
    ):
        self.server = server
        self.metric = metric
        self.current_value = current_value
        self.trend = trend
        self.slope = slope
        self.r_squared = r_squared
        self.days_to_warning = days_to_warning
        self.days_to_critical = days_to_critical
        self.predicted_7d = predicted_7d
        self.predicted_30d = predicted_30d
        self.confidence = confidence

    def to_dict(self) -> dict[str, Any]:
        return {
            "server": self.server,
            "metric": self.metric,
            "current_value": round(self.current_value, 1),
            "trend": self.trend,
            "slope_per_hour": round(self.slope, 4),
            "r_squared": round(self.r_squared, 3),
            "days_to_warning": round(self.days_to_warning, 1) if self.days_to_warning is not None else None,
            "days_to_critical": round(self.days_to_critical, 1) if self.days_to_critical is not None else None,
            "predicted_7d": round(self.predicted_7d, 1) if self.predicted_7d is not None else None,
            "predicted_30d": round(self.predicted_30d, 1) if self.predicted_30d is not None else None,
            "confidence": self.confidence,
        }


class Forecaster:
    """
    Generates forecasts for infrastructure metrics using simple linear
    regression on recent historical data.

    Data can be sourced from InfluxDB or from in-memory metric history.
    """

    def __init__(self):
        self._history: dict[str, list[tuple[datetime, float]]] = {}
        self._min_data_points = 5  # Need at least this many points for a forecast

    def record_metric(self, server: str, metric: str, value: float) -> None:
        """Record a metric observation for forecasting."""
        key = f"{server}:{metric}"
        if key not in self._history:
            self._history[key] = []
        self._history[key].append((datetime.utcnow(), value))

        # Keep only last 7 days of data
        cutoff = datetime.utcnow() - timedelta(days=7)
        self._history[key] = [
            (t, v) for t, v in self._history[key] if t > cutoff
        ]

    def record_from_snapshot(self, snapshot: dict) -> None:
        """Record all metrics from a poller snapshot."""
        server = snapshot.get("server", "unknown")
        for metric in ("cpu_percent", "memory_percent", "disk_percent"):
            value = snapshot.get(metric)
            if value is not None:
                self.record_metric(server, metric, value)

    def forecast(self, server: str, metric: str) -> Optional[MetricForecast]:
        """
        Generate a forecast for a specific server+metric combination.

        Args:
            server: Server name
            metric: Metric name (cpu_percent, memory_percent, disk_percent)

        Returns:
            MetricForecast with predictions, or None if insufficient data
        """
        key = f"{server}:{metric}"
        history = self._history.get(key, [])

        if len(history) < self._min_data_points:
            return None

        # Prepare regression data
        # x = hours since first data point, y = metric value
        first_time = history[0][0].timestamp()
        data = [((t.timestamp() - first_time) / 3600, v) for t, v in history]

        # Fit regression
        reg = LinearRegression(data)

        # Determine trend direction
        slope_per_hour = reg.slope
        if abs(slope_per_hour) < 0.01:
            trend = "stable"
        elif slope_per_hour > 0:
            trend = "increasing"
        else:
            trend = "decreasing"

        # Determine confidence based on R-squared and data quantity
        r2 = reg.r_squared
        n_points = len(history)
        if r2 > 0.7 and n_points >= 20:
            confidence = "high"
        elif r2 > 0.4 and n_points >= 10:
            confidence = "medium"
        else:
            confidence = "low"

        # Current value (most recent)
        current_value = history[-1][1]

        # Get thresholds from config
        thresholds = self._get_thresholds(metric)

        # Days to threshold
        now_hours = (datetime.utcnow().timestamp() - first_time) / 3600

        days_to_warning = None
        days_to_critical = None

        if abs(slope_per_hour) > 0.001:
            if trend == "increasing":
                # Calculate hours until each threshold is breached
                if thresholds.get("warning"):
                    hours_to_warn = (thresholds["warning"] - reg.intercept) / reg.slope - now_hours
                    days_to_warning = max(0, hours_to_warn / 24)
                    if days_to_warning < 0:
                        days_to_warning = 0  # Already at/beyond threshold

                if thresholds.get("critical"):
                    hours_to_crit = (thresholds["critical"] - reg.intercept) / reg.slope - now_hours
                    days_to_critical = max(0, hours_to_crit / 24)

        # Predicted values at 7 and 30 days
        hours_7d = now_hours + 7 * 24
        hours_30d = now_hours + 30 * 24
        predicted_7d = reg.predict(hours_7d) if reg.slope != 0 else current_value
        predicted_30d = reg.predict(hours_30d) if reg.slope != 0 else current_value

        return MetricForecast(
            server=server,
            metric=metric,
            current_value=current_value,
            trend=trend,
            slope=slope_per_hour,
            r_squared=r2,
            days_to_warning=days_to_warning,
            days_to_critical=days_to_critical,
            predicted_7d=predicted_7d,
            predicted_30d=predicted_30d,
            confidence=confidence,
        )

    def forecast_all(self, servers: list[str]) -> list[dict[str, Any]]:
        """
        Generate forecasts for all servers and all standard metrics.

        Args:
            servers: List of server names to forecast

        Returns:
            List of forecast dicts
        """
        results = []
        for server in servers:
            for metric in ("cpu_percent", "memory_percent", "disk_percent"):
                forecast = self.forecast(server, metric)
                if forecast:
                    results.append(forecast.to_dict())
        return results

    def _get_thresholds(self, metric: str) -> dict[str, float]:
        """Get warning/critical thresholds for a metric from config."""
        from app.config import settings
        if metric == "cpu_percent":
            return {
                "warning": settings.cpu_warn_threshold,
                "critical": settings.cpu_crit_threshold,
            }
        elif metric == "memory_percent":
            return {
                "warning": settings.mem_warn_threshold,
                "critical": settings.mem_crit_threshold,
            }
        elif metric == "disk_percent":
            return {
                "warning": settings.disk_warn_threshold,
                "critical": settings.disk_crit_threshold,
            }
        return {}


# Singleton forecaster
forecaster = Forecaster()
