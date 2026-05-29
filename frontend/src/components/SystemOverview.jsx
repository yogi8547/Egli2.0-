/*
 * SystemOverview — Top-level dashboard with aggregate metrics, server
 * health summary, and animated stat cards.
 *
 * Designed as a NOC-style "single pane of glass" view.
 */

import React, { useMemo } from 'react';
import {
  Activity,
  Server,
  HardDrive,
  MemoryStick,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Cpu,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

function StatCard({ icon: Icon, label, value, unit = '', sub, trend, color = 'accent' }) {
  const rawValue = typeof value === 'number' ? value : parseFloat(value);
  const isValidNumber = typeof rawValue === 'number' && !isNaN(rawValue);
  const animatedValue = useAnimatedNumber(isValidNumber ? rawValue : 0, 800);
  const displayValue = isValidNumber
    ? `${animatedValue.toFixed(unit ? 1 : 0)}${unit}`
    : (typeof value === 'string' ? value : '—');

  const colorClasses = {
    accent: 'text-accent-500 bg-accent-500/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    danger: 'text-danger bg-danger/10',
    info: 'text-info bg-info/10',
  };

  return (
    <div className="glass-card p-5 group hover:border-dark-500/50 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="metric-label">{label}</p>
          <p className="metric-value text-white mt-1">{displayValue}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color] || colorClasses.accent} group-hover:scale-110 transition-transform`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-3 text-xs ${trend.up ? 'text-success' : 'text-danger'}`}>
          {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{trend.up ? '+' : ''}{trend.value}% from last hour</span>
        </div>
      )}
    </div>
  );
}

function ServerStatusBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const dotColors = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  const barColors = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full ${dotColors[color] || 'bg-gray-500'}`} />
      <span className="text-xs text-gray-400 w-20">{label}</span>
      <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColors[color] || 'bg-gray-500'} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-300 w-8 text-right">{count}</span>
    </div>
  );
}

function MiniAreaChart({ data, color = '#81a1c1' }) {
  return (
    <div className="h-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              background: '#1e1e2e',
              border: '1px solid #404040',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#grad-${color.replace('#', '')})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SystemOverview({ overview, servers, metrics, alerts, onViewChange }) {
  // Check for critical alerts for glow indicator
  const hasCritical = useMemo(() =>
    alerts.some((a) => a.severity === 'critical' && a.status === 'active'),
    [alerts]
  );
  // Compute aggregate stats
  const stats = useMemo(() => {
    const metricsList = Object.values(metrics).filter(Boolean);
    const cpuValues = metricsList.map((m) => m.cpu_percent || 0);
    const memValues = metricsList.map((m) => m.memory_percent || 0);
    const diskValues = metricsList.map((m) => m.disk_percent || 0);

    return {
      avgCpu: cpuValues.length ? (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(1) : '—',
      avgMem: memValues.length ? (memValues.reduce((a, b) => a + b, 0) / memValues.length).toFixed(1) : '—',
      avgDisk: diskValues.length ? (diskValues.reduce((a, b) => a + b, 0) / diskValues.length).toFixed(1) : '—',
      serverCount: servers.length,
      onlineCount: servers.filter((s) => s.status === 'online').length,
      offlineCount: servers.filter((s) => s.status === 'offline').length,
      degradedCount: servers.filter((s) => s.status === 'degraded').length,
      activeAlerts: alerts.filter((a) => a.status === 'active').length,
    };
  }, [metrics, servers, alerts]);

  // Mock chart data for the "CPU Trend" area
  const cpuTrendData = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 20 }, (_, i) => ({
      time: new Date(now - (19 - i) * 180000).toISOString(),
      value: 30 + Math.random() * 40 + Math.sin(i * 0.5) * 15,
    }));
  }, []);

  const memTrendData = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 20 }, (_, i) => ({
      time: new Date(now - (19 - i) * 180000).toISOString(),
      value: 50 + Math.random() * 30 + Math.sin(i * 0.3) * 10,
    }));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Infrastructure Overview</h1>
        <p className="text-sm text-gray-400 mt-1">
          Real-time monitoring dashboard · {servers.length} servers · {stats.onlineCount} online
        </p>
      </div>

      {/* Glow indicator for critical alerts */}
      {hasCritical && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/10 border border-danger/30 animate-pulse-slow">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <span className="text-xs text-danger font-medium">
            Critical alerts active — check the Alerts panel
          </span>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Server}
          label="Servers"
          value={stats.serverCount}
          sub={`${stats.onlineCount} online · ${stats.degradedCount} degraded · ${stats.offlineCount} offline`}
          color="info"
        />
        <StatCard
          icon={Cpu}
          label="Avg CPU"
          value={parseFloat(stats.avgCpu)}
          unit="%"
          sub="Across all servers"
          color="accent"
          trend={{ up: true, value: 2.3 }}
        />
        <StatCard
          icon={MemoryStick}
          label="Avg Memory"
          value={parseFloat(stats.avgMem)}
          unit="%"
          sub="Of total capacity"
          color="warning"
          trend={{ up: false, value: 1.1 }}
        />
        <StatCard
          icon={HardDrive}
          label="Avg Disk"
          value={parseFloat(stats.avgDisk)}
          unit="%"
          sub="Of total capacity"
          color={parseFloat(stats.avgDisk) > 80 ? 'danger' : 'success'}
          trend={{ up: true, value: 0.5 }}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-200">CPU Trend (Last Hour)</h3>
            <Cpu className="w-4 h-4 text-accent-500" />
          </div>
          <MiniAreaChart data={cpuTrendData} color="#81a1c1" />
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-200">Memory Trend (Last Hour)</h3>
            <MemoryStick className="w-4 h-4 text-warning" />
          </div>
          <MiniAreaChart data={memTrendData} color="#ebcb8b" />
        </div>
      </div>

      {/* Server Status & Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Server Status Breakdown */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Server Status</h3>
          <div className="space-y-3">
            <ServerStatusBar
              label="Online"
              count={stats.onlineCount}
              total={stats.serverCount}
              color="success"
            />
            <ServerStatusBar
              label="Degraded"
              count={stats.degradedCount}
              total={stats.serverCount}
              color="warning"
            />
            <ServerStatusBar
              label="Offline"
              count={stats.offlineCount}
              total={stats.serverCount}
              color="danger"
            />
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-200">Recent Alerts</h3>
            <button
              onClick={() => onViewChange('alerts')}
              className="text-xs text-accent-500 hover:text-accent-600 transition-colors"
            >
              View All
            </button>
          </div>
          {alerts.filter((a) => a.status === 'active').slice(0, 5).length > 0 ? (
            <div className="space-y-2">
              {alerts
                .filter((a) => a.status === 'active')
                .slice(0, 5)
                .map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-dark-800/50"
                  >
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${
                      alert.severity === 'critical' ? 'text-danger' : 'text-warning'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 truncate">{alert.message}</p>
                      <p className="text-[10px] text-gray-500">{alert.server}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      alert.severity === 'critical'
                        ? 'bg-danger/20 text-danger'
                        : 'bg-warning/20 text-warning'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-20 text-gray-500 text-sm">
              <span className="text-success mr-2">✓</span>
              No active alerts
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
