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
  Trash2,
  Loader,
  PenLine,
  Wifi,
  CheckCircle,
  XCircle,
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
    color || '#00B9F1';

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
                <lineargradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gaugeColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={gaugeColor} stopOpacity={0} />
                </lineargradient>
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

export default function ServerCard({ server, metrics, alerts, onFetchHistory, metricHistory, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message, sys_name?, uptime_seconds?, duration_ms, error? }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/test-connection`);
      const data = await res.json();
      if (!res.ok) {
        setTestResult({
          success: false,
          message: data.detail || `Server error (${res.status})`,
          duration_ms: 0,
          error: data.detail || `HTTP ${res.status}`,
        });
      } else {
        setTestResult(data);
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message,
        error: err.message,
        duration_ms: 0,
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Delete failed (${res.status})`);
      }

      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'success',
          title: 'Server Removed',
          message: `${server.name} (${server.host}) has been removed from monitoring.`,
          duration: 5000,
        });
      }

      setShowDeleteConfirm(false);
      onDelete?.();
    } catch (err) {
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'critical',
          title: 'Delete Failed',
          message: err.message,
          duration: 8000,
        });
      }
    } finally {
      setDeleting(false);
    }
  }

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
        <MetricGauge label="CPU" value={cpu} icon={Cpu} color="#00B9F1" />
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
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Metric History
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-info/70 hover:text-info bg-info/5 hover:bg-info/10 rounded-md transition-all disabled:opacity-50"
              >
                {testing ? (
                  <Loader className="w-3 h-3 animate-spin" />
                ) : (
                  <Wifi className="w-3 h-3" />
                )}
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              <button
                onClick={() => onEdit?.(server)}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-accent-500/70 hover:text-accent-500 bg-accent-500/5 hover:bg-accent-500/10 rounded-md transition-all"
              >
                <PenLine className="w-3 h-3" />
                Edit
              </button>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-danger/70 hover:text-danger bg-danger/5 hover:bg-danger/10 rounded-md transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-lg px-2 py-1.5">
                  <span className="text-[10px] text-danger font-medium whitespace-nowrap">Remove this server?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-2 py-0.5 text-[10px] font-medium text-white bg-danger/60 hover:bg-danger rounded transition-all disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : (
                      'Yes'
                    )}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-white bg-dark-700 hover:bg-dark-600 rounded transition-all disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* ── Test Connection Result ───────────────────────────── */}
          {testResult && (
            <div
              className={`
                rounded-lg border p-3 text-xs space-y-1.5 animate-slide-up
                ${testResult.success
                  ? 'bg-success/5 border-success/20'
                  : 'bg-danger/5 border-danger/20'
                }
              `}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-danger" />
                )}
                <span className={`font-medium ${testResult.success ? 'text-success' : 'text-danger'}`}>
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </span>
                <span className="text-gray-500 ml-auto text-[10px]">
                  {testResult.duration_ms != null ? testResult.duration_ms.toFixed(0) : '—'}ms
                </span>
              </div>
              <p className="text-gray-400 text-[11px]">{testResult.message}</p>
              {testResult.sys_name && (
                <p className="text-gray-500 text-[10px]">System: {testResult.sys_name}</p>
              )}
              {testResult.uptime_seconds != null && (
                <p className="text-gray-500 text-[10px]">
                  Uptime: {testResult.uptime_seconds > 86400
                    ? `${(testResult.uptime_seconds / 86400).toFixed(1)}d`
                    : `${(testResult.uptime_seconds / 3600).toFixed(1)}h`}
                </p>
              )}
              {testResult.error && (
                <p className="text-danger/70 text-[10px] font-mono mt-1">{testResult.error}</p>
              )}
              <button
                onClick={() => setTestResult(null)}
                className="text-gray-500 hover:text-gray-300 text-[10px] underline mt-1"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <MetricSparkline
              label="CPU"
              server={server.name}
              measurement="cpu"
              onFetch={onFetchHistory}
              data={metricHistory[`${server.name}:cpu`]}
              color="#00B9F1"
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
                <lineargradient id={`hist-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </lineargradient>
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
