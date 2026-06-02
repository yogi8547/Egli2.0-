/*
 * AlertPanel — Displays all alerts with filtering, severity indicators,
 * and management actions (acknowledge, resolve).
 *
 * Follows the Grafana alerting UX pattern with clear severity coloring.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  Zap,
  Shield,
  ShieldCheck,
  Loader,
  AlertOctagon,
  Clock,
  History,
  Search,
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
  const [predefinedActions, setPredefinedActions] = useState({});
  const [loadingActions, setLoadingActions] = useState({});
  const [executingAction, setExecutingAction] = useState({}); // { [alertId]: actionName | null }
  const [actionResults, setActionResult] = useState({}); // { [alertId]: { actionName, status, output, ... } }
  const [confirmAction, setConfirmAction] = useState(null); // { alertId, action } or null
  const [remediationHistory, setRemediationHistory] = useState({}); // { [alertId]: [...] }
  const [loadingHistory, setLoadingHistory] = useState({});
  const [historyFilter, setHistoryFilter] = useState('all'); // all, success, failed, pending, skipped
  const [actionSearchQuery, setActionSearchQuery] = useState('');

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

  // Fetch predefined actions when an alert is expanded
  useEffect(() => {
    if (!expandedId) return;
    if (predefinedActions[expandedId]) return; // already loaded

    let cancelled = false;
    setLoadingActions((prev) => ({ ...prev, [expandedId]: true }));

    fetch(`${API_BASE}/alerts/${expandedId}/remediation-actions`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setPredefinedActions((prev) => ({
            ...prev,
            [expandedId]: data.actions || [],
          }));
        }
      })
      .catch((err) => console.error('Failed to load remediation actions:', err))
      .finally(() => {
        if (!cancelled) {
          setLoadingActions((prev) => ({ ...prev, [expandedId]: false }));
        }
      });

    return () => { cancelled = true; };
  }, [expandedId, predefinedActions]);

  // Fetch remediation history when an alert is expanded
  useEffect(() => {
    if (!expandedId) return;
    if (remediationHistory[expandedId]) return; // already loaded

    let cancelled = false;
    setLoadingHistory((prev) => ({ ...prev, [expandedId]: true }));

    fetch(`${API_BASE}/remediation/logs?alert_id=${encodeURIComponent(expandedId)}&limit=10`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setRemediationHistory((prev) => ({
            ...prev,
            [expandedId]: data.logs || [],
          }));
        }
      })
      .catch((err) => console.error('Failed to load remediation history:', err))
      .finally(() => {
        if (!cancelled) {
          setLoadingHistory((prev) => ({ ...prev, [expandedId]: false }));
        }
      });

    return () => { cancelled = true; };
  }, [expandedId, remediationHistory]);

  const executeAction = useCallback(async (alertId, action) => {
    setConfirmAction(null);
    setExecutingAction((prev) => ({ ...prev, [alertId]: action.action }));
    try {
      const res = await fetch(
        `${API_BASE}/alerts/${alertId}/execute-action?action=${encodeURIComponent(action.action)}`,
        { method: 'POST' }
      );
      const data = await res.json();
      const result = data.result || {};

      // Update inline result display
      setActionResult((prev) => ({
        ...prev,
        [alertId]: result,
      }));

      // Show toast notification
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: result.status === 'success' || result.status === 'pending'
            ? 'success' : result.status === 'failed' ? 'critical' : 'warning',
          title: result.status === 'success'
            ? 'Remediation: Success'
            : result.status === 'pending'
              ? 'Remediation: Simulated'
              : `Remediation: ${result.status}`,
          message: result.output?.slice(0, 120) || result.description || 'Action executed',
          duration: 6000,
        });
      }

      // Refresh alerts data
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to execute action:', err);
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'critical',
          title: 'Execution Failed',
          message: err.message || 'Could not reach server',
          duration: 6000,
        });
      }
    } finally {
      setExecutingAction((prev) => ({ ...prev, [alertId]: null }));
    }
  }, [onRefresh]);

  async function handleDeepAnalysis(alertId) {
    setRemediatingId(alertId);
    try {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/remediate?deep=true`, { method: 'POST' });
      const data = await res.json();
      setRemediation((prev) => ({ ...prev, [alertId]: data.remediation }));
    } catch (err) {
      console.error('Failed to get AI remediation:', err);
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

              {/* Expanded: Predefined Actions + AI */}
              {expandedId === alert.id && (
                <div className="border-t border-dark-700/50 p-4 space-y-4 animate-slide-up">
                  {/* Predefined Actions */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-3.5 h-3.5 text-accent-500" />
                      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Quick Actions
                      </h4>
                      <span className="text-[10px] text-gray-600">Instant — no AI needed</span>
                    </div>

                    {/* Search bar */}
                    {!loadingActions[alert.id] && predefinedActions[alert.id]?.length > 0 && (
                      <div className="relative mb-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                        <input
                          type="text"
                          value={actionSearchQuery}
                          onChange={(e) => setActionSearchQuery(e.target.value)}
                          placeholder="Filter actions..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-dark-800 border border-dark-700/50 text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-500/40 focus:border-accent-500/30 transition-all"
                        />
                        {actionSearchQuery && (
                          <button
                            onClick={() => setActionSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {loadingActions[alert.id] ? (
                      <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                        <Loader className="w-3.5 h-3.5 animate-spin" />
                        Loading actions...
                      </div>
                    ) : predefinedActions[alert.id]?.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(() => {
                          const q = actionSearchQuery.toLowerCase().trim();
                          const allActions = predefinedActions[alert.id] || [];
                          const filtered = q
                            ? allActions.filter((a) =>
                                (a.description || '').toLowerCase().includes(q) ||
                                (a.command || '').toLowerCase().includes(q) ||
                                (a.action || '').toLowerCase().includes(q) ||
                                (a.risk || '').toLowerCase().includes(q)
                              )
                            : allActions;

                          if (filtered.length === 0 && q) {
                            return (
                              <div className="col-span-full text-xs text-gray-500 py-3 text-center">
                                No actions match "<span className="text-gray-400">{actionSearchQuery}</span>".
                              </div>
                            );
                          }

                          return filtered.map((action, i) => {
                          const isExecuting = executingAction[alert.id] === action.action;
                          const actionResult = actionResults[alert.id];
                          const isThisActionResult = actionResult && actionResult.action === action.action;

                          return (
                            <div key={i} className={`
                              flex flex-col rounded-lg border transition-all
                              ${action.risk === 'high'
                                ? 'bg-danger/5 border-danger/20'
                                : action.risk === 'low'
                                  ? 'bg-success/5 border-success/20'
                                  : 'bg-warning/5 border-warning/20'
                              }
                              ${isThisActionResult && actionResult.status === 'success' ? 'ring-1 ring-success/40' : ''}
                              ${isThisActionResult && actionResult.status === 'failed' ? 'ring-1 ring-danger/40' : ''}
                            `}>
                              {/* Main card body */}
                              <div className="flex items-start gap-2.5 p-3">
                                <div className={`
                                  p-1.5 rounded-lg shrink-0
                                  ${action.risk === 'high' ? 'bg-danger/10 text-danger'
                                    : action.risk === 'low' ? 'bg-success/10 text-success'
                                    : 'bg-warning/10 text-warning'}
                                `}>
                                  {isThisActionResult && actionResult.status === 'success' ? (
                                    <ShieldCheck className="w-3 h-3" />
                                  ) : isThisActionResult && actionResult.status === 'failed' ? (
                                    <XCircle className="w-3 h-3" />
                                  ) : (
                                    <Shield className="w-3 h-3" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-xs font-medium text-gray-200">
                                      {action.description}
                                    </span>
                                    <span className={`
                                      text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0
                                      ${action.risk === 'high' ? 'bg-danger/20 text-danger'
                                        : action.risk === 'low' ? 'bg-success/20 text-success'
                                        : 'bg-warning/20 text-warning'}
                                    `}>
                                      {action.risk}
                                    </span>
                                  </div>
                                  {action.command && (
                                    <code className="text-[10px] text-gray-500 font-mono block truncate mt-0.5">
                                      {action.command}
                                    </code>
                                  )}
                                  {/* Inline result feedback */}
                                  {isThisActionResult && (
                                    <div className={`
                                      mt-1.5 text-[10px] font-mono truncate
                                      ${actionResult.status === 'success' ? 'text-success'
                                        : actionResult.status === 'failed' ? 'text-danger'
                                        : actionResult.status === 'pending' ? 'text-warning'
                                        : 'text-gray-500'}
                                    `}>
                                      {actionResult.status === 'success' && '✓ Executed successfully'}
                                      {actionResult.status === 'pending' && '🔷 Simulated (dry run)'}
                                      {actionResult.status === 'failed' && '✗ Execution failed'}
                                      {actionResult.status === 'skipped' && '⏭ Conditions not met'}
                                    </div>
                                  )}
                                </div>
                                {/* Execute button */}
                                <button
                                  onClick={() => {
                                    if (action.risk === 'high') {
                                      setConfirmAction({ alertId: alert.id, action });
                                    } else {
                                      executeAction(alert.id, action);
                                    }
                                  }}
                                  disabled={isExecuting}
                                  className={`
                                    shrink-0 p-1.5 rounded-md transition-all
                                    ${isExecuting ? 'opacity-50 cursor-not-allowed'
                                      : action.risk === 'high'
                                        ? 'text-danger hover:bg-danger/10'
                                        : 'text-accent-500 hover:bg-accent-500/10'
                                    }
                                  `}
                                  title={action.risk === 'high' ? 'Click to confirm execution' : 'Execute action'}
                                >
                                  {isExecuting ? (
                                    <Loader className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Terminal className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              {/* Execution status bar */}
                              {isThisActionResult && actionResult.output && (
                                <div className={`
                                  px-3 py-1.5 border-t text-[10px] font-mono leading-relaxed max-h-16 overflow-y-auto
                                  ${actionResult.status === 'success' ? 'border-success/20 text-success/70'
                                    : actionResult.status === 'failed' ? 'border-danger/20 text-danger/70'
                                    : 'border-dark-700/50 text-gray-500'}
                                `}>
                                  {actionResult.output.slice(0, 200)}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 py-2">
                        No predefined actions available for this metric type.
                      </div>
                    )}
                  </div>

                  {/* High-Risk Confirmation Dialog */}
                  {confirmAction && confirmAction.alertId === alert.id && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        <AlertOctagon className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-danger mb-1">Confirm High-Risk Action</p>
                          <p className="text-xs text-gray-300 mb-2">
                            This will execute: <strong>{confirmAction.action.description}</strong>
                          </p>
                          <p className="text-[10px] text-gray-400 mb-3 font-mono">
                            {confirmAction.action.command}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => executeAction(alert.id, confirmAction.action)}
                              className="px-3 py-1.5 text-xs font-medium rounded-md bg-danger/20 text-danger hover:bg-danger/30 transition-all"
                            >
                              Yes, Execute
                            </button>
                            <button
                              onClick={() => setConfirmAction(null)}
                              className="px-3 py-1.5 text-xs font-medium rounded-md bg-dark-800 text-gray-400 hover:text-white transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Deep Analysis */}
                  <div className="border-t border-dark-700/30 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Bot className="w-3.5 h-3.5 text-info" />
                        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                          AI Deep Analysis
                        </h4>
                        <span className="text-[10px] text-gray-600">Takes 10–30s</span>
                      </div>
                      <button
                        onClick={() => handleDeepAnalysis(alert.id)}
                        disabled={remediatingId === alert.id}
                        className="flex items-center gap-1.5 text-xs text-info hover:text-info/80 transition-colors disabled:opacity-50"
                      >
                        {remediatingId === alert.id ? (
                          <>
                            <Loader className="w-3 h-3 animate-spin" />
                            Analyzing with AI...
                          </>
                        ) : (
                          <>
                            <Terminal className="w-3 h-3" />
                            Deep Analysis
                          </>
                        )}
                      </button>
                    </div>

                    {remediation[alert.id] ? (
                      <div className="bg-dark-900/50 rounded-lg p-3 font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {remediation[alert.id]}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">
                        Need more detail? Click "Deep Analysis" for an AI-powered root cause and remediation strategy.
                      </div>
                    )}
                  </div>

                  {/* Remediation History */}
                  <div className="border-t border-dark-700/30 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-accent-500" />
                        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Remediation History
                        </h4>
                        {loadingHistory[alert.id] && (
                          <Loader className="w-3 h-3 animate-spin text-gray-500" />
                        )}
                      </div>
                      {/* Status filter */}
                      {remediationHistory[alert.id]?.length > 0 && (
                        <div className="flex items-center gap-1 bg-dark-800 rounded-md p-0.5">
                          {['all', 'success', 'failed', 'pending', 'skipped'].map((f) => (
                            <button
                              key={f}
                              onClick={() => setHistoryFilter(f)}
                              className={`
                                px-2 py-0.5 text-[10px] rounded transition-all
                                ${historyFilter === f
                                  ? (f === 'success' ? 'bg-success/20 text-success'
                                    : f === 'failed' ? 'bg-danger/20 text-danger'
                                    : f === 'pending' ? 'bg-warning/20 text-warning'
                                    : f === 'skipped' ? 'bg-gray-500/20 text-gray-400'
                                    : 'bg-accent-500/20 text-accent-500')
                                  : 'text-gray-500 hover:text-gray-300'
                                }
                              `}
                            >
                              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {(() => {
                      const filtered = historyFilter === 'all'
                        ? (remediationHistory[alert.id] || [])
                        : (remediationHistory[alert.id] || []).filter((e) => e.status === historyFilter);

                      if (filtered.length === 0 && remediationHistory[alert.id]?.length > 0) {
                        return (
                          <div className="text-xs text-gray-600 py-2">
                            No {historyFilter} entries in history.
                          </div>
                        );
                      }

                      return filtered.length > 0 ? (
                        <div className="space-y-2">
                          {filtered.map((entry, i) => (
                          <div
                            key={entry.id || i}
                            className={`
                              flex items-start gap-3 p-2.5 rounded-lg border text-xs
                              ${entry.status === 'success' ? 'bg-success/5 border-success/20'
                                : entry.status === 'failed' ? 'bg-danger/5 border-danger/20'
                                : entry.status === 'pending' ? 'bg-warning/5 border-warning/20'
                                : entry.status === 'skipped' ? 'bg-dark-800 border-dark-700/50'
                                : 'bg-dark-800 border-dark-700/50'}
                            `}
                          >
                            {/* Timeline dot */}
                            <div className="flex flex-col items-center shrink-0">
                              <div className={`
                                w-2 h-2 rounded-full mt-1
                                ${entry.status === 'success' ? 'bg-success'
                                  : entry.status === 'failed' ? 'bg-danger'
                                  : entry.status === 'pending' ? 'bg-warning'
                                  : 'bg-gray-500'}
                              `} />
                              {i < remediationHistory[alert.id].length - 1 && (
                                <div className="w-px flex-1 bg-dark-700/50 mt-1" />
                              )}
                            </div>

                            {/* Entry content */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-gray-200">
                                  {entry.description || entry.action}
                                </span>
                                <span className={`
                                  text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0
                                  ${entry.status === 'success' ? 'bg-success/20 text-success'
                                    : entry.status === 'failed' ? 'bg-danger/20 text-danger'
                                    : entry.status === 'pending' ? 'bg-warning/20 text-warning'
                                    : 'bg-dark-700 text-gray-400'}
                                `}>
                                  {entry.status}
                                </span>
                                {entry.risk && entry.risk !== 'none' && (
                                  <span className={`
                                    text-[10px] font-medium px-1.5 py-0.5 rounded
                                    ${entry.risk === 'high' ? 'bg-danger/10 text-danger/70'
                                      : entry.risk === 'low' ? 'bg-success/10 text-success/70'
                                      : 'bg-warning/10 text-warning/70'}
                                  `}>
                                    {entry.risk}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                <span className="font-mono">{entry.server}</span>
                                <span className="font-mono">{entry.metric}</span>
                                {entry.timestamp && (
                                  <span>{new Date(entry.timestamp).toLocaleString()}</span>
                                )}
                              </div>
                              {entry.output && (
                                <div className="mt-1 text-[10px] font-mono text-gray-500 leading-relaxed truncate">
                                  {entry.output.slice(0, 150)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>                      ) : (
                        !loadingHistory[alert.id] && (
                          <div className="text-xs text-gray-600 py-2">
                            No remediation history for this alert.
                          </div>
                        )
                      );
                    })()}
                  </div>

                  {/* Alert details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-dark-700/30">
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
