/**
 * ForecastCard — Shows predictive analytics for a server's metrics.
 * Displays trend direction, days-until-threshold projections, and
 * confidence levels for the forecast.
 *
 * Used inside ServerCard or as standalone forecast widgets.
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

const TREND_ICONS = {
  increasing: TrendingUp,
  decreasing: TrendingDown,
  stable: Minus,
};

const TREND_COLORS = {
  increasing: 'text-danger',
  decreasing: 'text-success',
  stable: 'text-gray-400',
};

const CONFIDENCE_COLORS = {
  high: 'bg-success/20 text-success',
  medium: 'bg-warning/20 text-warning',
  low: 'bg-gray-500/20 text-gray-400',
};

function ForecastMetric({ metric, forecast }) {
  if (!forecast) return null;

  const TrendIcon = TREND_ICONS[forecast.trend] || Minus;
  const trendColor = TREND_COLORS[forecast.trend] || 'text-gray-400';
  const confColor = CONFIDENCE_COLORS[forecast.confidence] || 'text-gray-500 bg-dark-700';

  const metricLabels = {
    cpu_percent: 'CPU',
    memory_percent: 'Memory',
    disk_percent: 'Disk',
  };

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-300">
          {metricLabels[metric] || metric}
        </h4>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${confColor}`}>
          {forecast.confidence} confidence
        </span>
      </div>

      {/* Current & Trend */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <TrendIcon className={`w-4 h-4 ${trendColor}`} />
          <span className={`text-sm font-mono font-semibold ${trendColor}`}>
            {forecast.current_value}%
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          {forecast.slope_per_hour > 0 ? '+' : ''}
          {forecast.slope_per_hour?.toFixed(3)}%/hr
        </span>
      </div>

      {/* Projections */}
      <div className="grid grid-cols-2 gap-2">
        {forecast.days_to_warning !== null && forecast.days_to_warning !== undefined && (
          <div className="bg-warning/10 rounded-lg p-2">
            <p className="text-[10px] text-warning font-medium">Warning in</p>
            <p className="text-sm font-mono font-semibold text-warning">
              {forecast.days_to_warning < 1
                ? '<1 day'
                : `${Math.ceil(forecast.days_to_warning)} days`}
            </p>
          </div>
        )}
        {forecast.days_to_critical !== null && forecast.days_to_critical !== undefined && (
          <div className="bg-danger/10 rounded-lg p-2">
            <p className="text-[10px] text-danger font-medium">Critical in</p>
            <p className="text-sm font-mono font-semibold text-danger">
              {forecast.days_to_critical < 1
                ? '<1 day'
                : `${Math.ceil(forecast.days_to_critical)} days`}
            </p>
          </div>
        )}
        {forecast.days_to_warning === null && forecast.days_to_critical === null && (
          <div className="col-span-2">
            <p className="text-[10px] text-success">
              {forecast.trend === 'decreasing'
                ? 'Trending downward — no threshold breach expected'
                : forecast.trend === 'stable'
                  ? 'Stable — no significant change expected'
                  : 'Insufficient data for projections'}
            </p>
          </div>
        )}
      </div>

      {/* Predicted values */}
      {(forecast.predicted_7d || forecast.predicted_30d) && (
        <div className="flex items-center gap-4 pt-1 border-t border-dark-700/50">
          {forecast.predicted_7d !== null && forecast.predicted_7d !== undefined && (
            <div>
              <span className="text-[10px] text-gray-500">7d</span>
              <span className="ml-1.5 text-xs font-mono text-gray-300">
                {forecast.predicted_7d.toFixed(1)}%
              </span>
            </div>
          )}
          {forecast.predicted_30d !== null && forecast.predicted_30d !== undefined && (
            <div>
              <span className="text-[10px] text-gray-500">30d</span>
              <span className="ml-1.5 text-xs font-mono text-gray-300">
                {forecast.predicted_30d.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ForecastCard({ server, forecasts }) {
  if (!forecasts || forecasts.length === 0) {
    return (
      <div className="glass-card p-6 flex flex-col items-center justify-center gap-2">
        <Calendar className="w-10 h-10 text-gray-600" />
        <p className="text-sm text-gray-500">No forecast data yet</p>
        <p className="text-xs text-gray-600">
          Data will be available after a few polling cycles
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent-500" />
        <h3 className="text-sm font-medium text-gray-200">
          Predictive Forecasts — {server}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {forecasts.map((fc) => (
          <ForecastMetric
            key={fc.metric}
            metric={fc.metric}
            forecast={fc}
          />
        ))}
      </div>

      {/* Summary callout */}
      {forecasts.some((f) => f.days_to_critical !== null) && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/10 border border-danger/30">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          <span className="text-xs text-danger">
            Critical threshold projections detected — consider proactive action
          </span>
        </div>
      )}
    </div>
  );
}
