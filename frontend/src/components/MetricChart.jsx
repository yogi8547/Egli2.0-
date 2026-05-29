/*
 * MetricChart — Reusable animated chart component for metric visualization.
 *
 * Supports area, line, and bar chart types with configurable colors,
 * gradients, and time ranges. Used across the dashboard for metric history.
 */

import React, { useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const CHART_COLORS = {
  cpu: '#81a1c1',
  memory: '#ebcb8b',
  disk: '#a3be8c',
  network: '#b48ead',
  default: '#81a1c1',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-mono" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
        </p>
      ))}
    </div>
  );
}

export default function MetricChart({
  data = [],
  type = 'area',
  metric = 'default',
  title,
  height = 200,
  showGrid = true,
  timeFormat = 'time',
}) {
  const color = CHART_COLORS[metric] || CHART_COLORS.default;
  const gradientId = `metricGrad-${metric}-${Math.random().toString(36).slice(2, 8)}`;

  const formattedData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      label: timeFormat === 'time'
        ? new Date(point.time).toLocaleTimeString()
        : point.time,
    }));
  }, [data, timeFormat]);

  if (!formattedData.length) {
    return (
      <div className="glass-card p-5">
        {title && <h3 className="text-sm font-medium text-gray-200 mb-4">{title}</h3>}
        <div className="flex items-center justify-center" style={{ height }}>
          <p className="text-sm text-gray-500">No data available</p>
        </div>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart data={formattedData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#404040" strokeOpacity={0.3} />}
            <XAxis
              dataKey="label"
              tick={{ fill: '#808080', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#404040', strokeOpacity: 0.3 }}
            />
            <YAxis
              tick={{ fill: '#808080', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#404040', strokeOpacity: 0.3 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
              animationDuration={500}
            />
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart data={formattedData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#404040" strokeOpacity={0.3} />}
            <XAxis
              dataKey="label"
              tick={{ fill: '#808080', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#404040', strokeOpacity: 0.3 }}
            />
            <YAxis
              tick={{ fill: '#808080', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#404040', strokeOpacity: 0.3 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="value"
              fill={color}
              radius={[2, 2, 0, 0]}
              animationDuration={500}
            />
          </BarChart>
        );

      default: // area
        return (
          <AreaChart data={formattedData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#404040" strokeOpacity={0.3} />}
            <XAxis
              dataKey="label"
              tick={{ fill: '#808080', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#404040', strokeOpacity: 0.3 }}
            />
            <YAxis
              tick={{ fill: '#808080', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#404040', strokeOpacity: 0.3 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
              animationDuration={500}
            />
          </AreaChart>
        );
    }
  };

  return (
    <div className="glass-card p-5">
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-200">{title}</h3>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-gray-500 uppercase">{metric}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
