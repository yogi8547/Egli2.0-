/*
 * ServerCard — Displays a single server's status and key metrics.
 *
 * Shows live CPU, memory, disk, and network values with sparkline
 * charts and status indicators. Supports expand-to-detail interaction.
 */

import React, { useState } from 'react';
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  ChevronDown,
  ChevronUp,
  Terminal,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

function MetricGauge({ label, value, icon: Icon, color, unit = '%', trend = [] }) {
  const animatedValue = useAnimatedNumber(typeof value === 'number' ? value : 0, 600);
  const displayValue = typeof value === 'number' ? animatedValue.toFixed(1) : value;

  const gaugeColor =
    value > 90 ? '#bf616a' :
    value > 75 ? '#ebcb8b' :
    color || '#81a1c1';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={{ color: gaugeColor }} />
          <span className="text-xs text-gray-400">{label}</span>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: gaugeColor }}>
          {displayValue}{unit}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(animatedValue, 100)}%`,
            backgroundColor: gaugeColor,
          }}
        />
      </div>

      {/* Mini sparkline */}
      {trend.length > 0 && (
        <div className="h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gaugeColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={gaugeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={gaugeColor}
                fill={`url(#spark-${label})`}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function ServerCard({ server, metrics, alerts, onFetchHistory, metricHistory }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = {
    online: 'bg-success',
    offline: 'bg-danger',
    degraded: 'bg-warning',
    unknown: 'bg-gray-500',
  }[server.status] || 'bg-gray-500';

  const m = metrics || {};
  const cpu = m.cpu_percent || 0;
  const mem = m.memory_percent || 0;
  const disk = m.disk_percent || 0;
  const uptime = m.uptime_seconds || 0;

  const alertCount = alerts?.length || 0;
  const critAlerts = alerts?.filter((a) => a.severity === 'critical').length || 0;

  // Format uptime
  const uptimeStr = uptime > 86400
    ? `${(uptime / 86400).toFixed(0)}d`
    : uptime > 3600
      ? `${(uptime / 3600).toFixed(0)}h`
      : `${(uptime / 60).toFixed(0)}m`;

  return (
    <div
      className={`
        glass-card overflow-hidden group
        hover:border-dark-500/50 transition-all duration-300
        ${expanded ? 'ring-1 ring-accent-500/30' : ''}
        ${critAlerts > 0 ? 'animate-alert-pulse' : ''}
      `}
    >
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`status-dot ${statusColor.replace('bg-', '')}`} />
            <div>
              <h3 className="text-sm font-semibold text-white">{server.name}</h3>
              <p className="text-[10px] text-gray-500 font-mono">{server.host}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {critAlerts > 0 && (
              <span className="flex items-center gap-1 bg-danger/20 text-danger text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {alertCount}
              </span>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-dark-700 transition-all"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Uptime & last seen */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] text-gray-500">Uptime: {uptimeStr}</span>
          </div>
          <div className="flex items-center gap-1">
            <Terminal className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] text-gray-500">{server.id}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-4 pb-4 space-y-3">
        <MetricGauge label="CPU" value={cpu} icon={Cpu} color="#81a1c1" />
        <MetricGauge label="Memory" value={mem} icon={MemoryStick} color="#ebcb8b" />
        <MetricGauge label="Disk" value={disk} icon={HardDrive} color="#a3be8c" />

        {/* Network stats */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-info" />
            <span className="text-xs text-gray-400">Network</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-gray-500">
              RX {m.network_rx_bytes ? (m.network_rx_bytes / 1e6).toFixed(1) : '—'} MB
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              TX {m.network_tx_bytes ? (m.network_tx_bytes / 1e6).toFixed(1) : '—'} MB
            </span>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-dark-700/50 p-4 space-y-4 animate-slide-up">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Metric History
          </h4>
          <div className="grid grid-cols-1 gap-3">
            <MetricSparkline
              label="CPU"
              server={server.name}
              measurement="cpu"
              onFetch={onFetchHistory}
              data={metricHistory[`${server.name}:cpu`]}
              color="#81a1c1"
            />
            <MetricSparkline
              label="Memory"
              server={server.name}
              measurement="memory"
              onFetch={onFetchHistory}
              data={metricHistory[`${server.name}:memory`]}
              color="#ebcb8b"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricSparkline({ label, server, measurement, onFetch, data, color }) {
  React.useEffect(() => {
    if (onFetch) onFetch(measurement);
  }, [server, measurement]);

  const chartData = (data || []).slice(-30).reverse().map((p) => ({
    time: new Date(p.time).toLocaleTimeString(),
    value: p.value,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500">{label}</span>
        <button
          onClick={() => onFetch(measurement)}
          className="text-[10px] text-accent-500 hover:text-accent-400"
        >
          Refresh
        </button>
      </div>
      <div className="h-16">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`hist-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={`url(#hist-${label})`}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] text-gray-600">
            No history data
          </div>
        )}
      </div>
    </div>
  );
}
