/**
 * SelfHealingPanel — Shows auto-remediation actions taken and allows
 * toggling auto-remediation mode.
 *
 * Displays a timeline of remediation actions with status indicators,
 * risk levels, and descriptions of what was done.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldOff,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Terminal,
  RefreshCw,
  Zap,
} from 'lucide-react';

const API_BASE = '/api';

const STATUS_ICONS = {
  success: CheckCircle,
  failed: XCircle,
  pending: Clock,
  skipped: AlertTriangle,
  executing: Activity,
};

const STATUS_COLORS = {
  success: 'text-success bg-success/10',
  failed: 'text-danger bg-danger/10',
  pending: 'text-warning bg-warning/10',
  skipped: 'text-gray-500 bg-dark-700/50',
  executing: 'text-info bg-info/10',
};

const RISK_COLORS = {
  low: 'bg-success/20 text-success',
  medium: 'bg-warning/20 text-warning',
  high: 'bg-danger/20 text-danger',
};

export default function SelfHealingPanel() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [autoRemediate, setAutoRemediate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/remediation/logs?limit=30`),
        fetch(`${API_BASE}/remediation/stats`),
      ]);
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();
      setLogs(logsData.logs || []);
      setStats(statsData);
      setAutoRemediate(statsData.auto_remediate_enabled || false);
    } catch (err) {
      console.error('Failed to fetch remediation data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleToggle() {
    setToggling(true);
    try {
      await fetch(`${API_BASE}/remediation/toggle?enabled=${!autoRemediate}`, {
        method: 'POST',
      });
      setAutoRemediate(!autoRemediate);
    } catch (err) {
      console.error('Failed to toggle auto-remediation:', err);
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-8 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Activity className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading remediation data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Self-Healing</h1>
          <p className="text-sm text-gray-400 mt-1">
            Automated remediation engine — detects and fixes issues automatically
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              transition-all duration-300
              ${autoRemediate
                ? 'bg-success/20 text-success hover:bg-success/30'
                : 'bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700'
              }
              disabled:opacity-50
            `}
          >
            {autoRemediate ? (
              <>
                <Shield className="w-4 h-4" />
                Auto-Remediate ON
              </>
            ) : (
              <>
                <ShieldOff className="w-4 h-4" />
                Auto-Remediate OFF
              </>
            )}
          </button>

          <button
            onClick={fetchData}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-800 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="metric-label">Total Actions</p>
            <p className="metric-value text-white mt-1">{stats.total_actions}</p>
          </div>
          <div className="glass-card p-4">
            <p className="metric-label">Successful</p>
            <p className="metric-value text-success mt-1">
              {stats.by_status?.success || 0}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="metric-label">Failed</p>
            <p className="metric-value text-danger mt-1">
              {stats.by_status?.failed || 0}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="metric-label">Active Cooldowns</p>
            <p className="metric-value text-warning mt-1">
              {stats.active_cooldowns || 0}
            </p>
          </div>
        </div>
      )}

      {/* Remediation log */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-500" />
            Recent Remediation Actions
          </h3>
        </div>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Shield className="w-12 h-12 text-gray-600" />
            <p className="text-sm text-gray-500">No remediation actions yet</p>
            <p className="text-xs text-gray-600">
              Actions will appear here when the system detects issues
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const StatusIcon = STATUS_ICONS[log.status] || Activity;
              const statusColor = STATUS_COLORS[log.status] || 'text-gray-400 bg-dark-700/50';
              const riskColor = RISK_COLORS[log.risk] || 'text-gray-500 bg-dark-700';

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-dark-800/50 hover:bg-dark-800 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${statusColor}`}>
                    <StatusIcon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-200">
                        {log.description}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${riskColor}`}>
                        {log.risk}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-gray-500">{log.server}</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-500">{log.metric}</span>
                      <span className="text-gray-600">·</span>
                      <span className="font-mono text-gray-500">{log.action}</span>
                    </div>
                    {log.output && (
                      <div className="mt-1 text-[10px] font-mono text-gray-500 truncate">
                        {log.output}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-gray-600 font-mono shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
