/*
 * AlertPanel — Displays all alerts with filtering, severity indicators,
 * and management actions (acknowledge, resolve).
 *
 * Follows the Grafana alerting UX pattern with clear severity coloring.
 */

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  XCircle,
  Filter,
  RefreshCw,
  Terminal,
  ChevronDown,
  ChevronUp,
  Bot,
} from 'lucide-react';

const API_BASE = '/api';

function AlertIcon({ severity }) {
  const config = {
    critical: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger/10' },
    warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
    info: { icon: Eye, color: 'text-info', bg: 'bg-info/10' },
  };

  const c = config[severity] || config.warning;
  const Icon = c.icon;

  return (
    <div className={`p-2 rounded-lg ${c.bg}`}>
      <Icon className={`w-4 h-4 ${c.color}`} />
    </div>
  );
}

function SeverityBadge({ severity }) {
  const classes = {
    critical: 'bg-danger/20 text-danger',
    warning: 'bg-warning/20 text-warning',
    info: 'bg-info/20 text-info',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${classes[severity] || classes.warning}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }) {
  const classes = {
    active: 'bg-danger/10 text-danger border border-danger/30',
    acknowledged: 'bg-warning/10 text-warning border border-warning/30',
    resolved: 'bg-success/10 text-success border border-success/30',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${classes[status] || classes.active}`}>
      {status}
    </span>
  );
}

export default function AlertPanel({ alerts, onRefresh }) {
  const [filter, setFilter] = useState('all'); // all, active, critical
  const [expandedId, setExpandedId] = useState(null);
  const [remediatingId, setRemediatingId] = useState(null);
  const [remediation, setRemediation] = useState({});

  const filteredAlerts = useMemo(() => {
    if (filter === 'active') return alerts.filter((a) => a.status === 'active');
    if (filter === 'critical') return alerts.filter((a) => a.severity === 'critical');
    return alerts;
  }, [alerts, filter]);

  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  async function handleAcknowledge(alertId) {
    try {
      await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  async function handleResolve(alertId) {
    try {
      await fetch(`${API_BASE}/alerts/${alertId}/resolve`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  }

  async function handleRemediate(alertId) {
    setRemediatingId(alertId);
    try {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/remediate`, { method: 'POST' });
      const data = await res.json();
      setRemediation((prev) => ({ ...prev, [alertId]: data.remediation }));
    } catch (err) {
      console.error('Failed to get remediation:', err);
    } finally {
      setRemediatingId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">
            {activeCount} active · {criticalCount} critical
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter */}
          <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1">
            {['all', 'active', 'critical'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  filter === f
                    ? 'bg-accent-500/20 text-accent-500'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-800 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-3">
          <CheckCircle className="w-12 h-12 text-success/50" />
          <p className="text-gray-400 text-sm">No alerts to display</p>
          <p className="text-gray-600 text-xs">All systems operating normally</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`
                glass-card overflow-hidden transition-all duration-300
                ${expandedId === alert.id ? 'ring-1 ring-accent-500/30' : ''}
                ${alert.severity === 'critical' ? 'border-danger/20' : ''}
              `}
            >
              {/* Alert header */}
              <div className="p-4">
                <div className="flex items-start gap-4">
                  <AlertIcon severity={alert.severity} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={alert.severity} />
                      <StatusBadge status={alert.status} />
                      <span className="text-xs text-gray-500 font-mono">{alert.server}</span>
                    </div>
                    <p className="text-sm text-gray-200">{alert.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[10px] text-gray-500">
                        Metric: {alert.metric} · Value: {alert.value?.toFixed(1)} · Threshold: {alert.threshold}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(alert.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {alert.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="p-1.5 rounded text-warning hover:bg-warning/10 transition-all"
                          title="Acknowledge"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="p-1.5 rounded text-success hover:bg-success/10 transition-all"
                          title="Resolve"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                      className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-dark-700 transition-all"
                    >
                      {expandedId === alert.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded: AI Remediation */}
              {expandedId === alert.id && (
                <div className="border-t border-dark-700/50 p-4 space-y-3 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5" />
                      AI Remediation
                    </h4>
                    <button
                      onClick={() => handleRemediate(alert.id)}
                      disabled={remediatingId === alert.id}
                      className="flex items-center gap-1.5 text-xs text-accent-500 hover:text-accent-400 transition-colors disabled:opacity-50"
                    >
                      <Terminal className="w-3 h-3" />
                      {remediatingId === alert.id ? 'Analyzing...' : 'Generate'}
                    </button>
                  </div>

                  {remediation[alert.id] ? (
                    <div className="bg-dark-900/50 rounded-lg p-3 font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {remediation[alert.id]}
                    </div>
                  ) : (
                    <div className="bg-dark-900/50 rounded-lg p-3 text-xs text-gray-500">
                      Click "Generate" to get AI-powered remediation suggestions
                    </div>
                  )}

                  {/* Alert details */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Alert ID</span>
                      <span className="text-xs font-mono text-gray-300">{alert.id}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Metric</span>
                      <span className="text-xs font-mono text-gray-300">{alert.metric}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Current Value</span>
                      <span className="text-xs font-mono text-gray-300">{alert.value?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Threshold</span>
                      <span className="text-xs font-mono text-gray-300">{alert.threshold}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
