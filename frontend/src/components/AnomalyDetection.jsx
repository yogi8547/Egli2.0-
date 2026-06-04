/**
 * AnomalyDetection — Dashboard for statistical anomaly detection.
 *
 * Displays real-time anomaly detections, learned baselines per
 * server/metric/hour, and summary statistics from the backend's
 * AnomalyDetector service.
 *
 * API endpoints:
 *   GET /api/anomalies              — Recent anomaly detections
 *   GET /api/anomalies/summary      — Summary stats
 *   GET /api/anomalies/baselines    — Learned baselines per server+metric+hour
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  Search,
  Zap,
  BarChart3,
  Layers,
} from 'lucide-react';

const API_BASE = '/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(isoStr) {
  return new Date(isoStr).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const METRIC_ICONS = {
  cpu_percent: Cpu,
  memory_percent: MemoryStick,
  disk_percent: HardDrive,
};

const METRIC_LABELS = {
  cpu_percent: 'CPU',
  memory_percent: 'Memory',
  disk_percent: 'Disk',
};

const SEVERITY_COLORS = {
  critical: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', dot: 'bg-danger' },
  warning: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', dot: 'bg-warning' },
};

// ── Loading Skeleton ─────────────────────────────────────────────────────

function AnomalySkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-4">
            <div className="h-3 w-20 bg-dark-600 rounded" />
            <div className="h-8 w-12 bg-dark-600 rounded mt-2" />
            <div className="h-3 w-28 bg-dark-600/60 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 bg-dark-600 rounded" />
            <div className="h-4 w-36 bg-dark-600 rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-dark-700/50 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 bg-dark-600 rounded" />
            <div className="h-4 w-32 bg-dark-600 rounded" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded bg-dark-600" />
                <div className="h-3 flex-1 bg-dark-700 rounded" />
                <div className="h-3 w-12 bg-dark-600 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Anomaly Timeline ─────────────────────────────────────────────────────

function AnomalyTimeline({ anomalies }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <div className="p-3 rounded-full bg-success/10">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <p className="text-sm text-gray-500">No anomalies detected</p>
        <p className="text-xs text-gray-600 text-center max-w-xs">
          All metrics are within expected baselines. Anomalies will appear here when statistical deviations are found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {anomalies.map((anomaly, i) => {
        const MetricIcon = METRIC_ICONS[anomaly.metric] || Activity;
        const colors = SEVERITY_COLORS[anomaly.severity] || SEVERITY_COLORS.warning;
        const isHigh = anomaly.direction === 'high';
        const expectedLow = anomaly.expected_range?.[0];
        const expectedHigh = anomaly.expected_range?.[1];

        return (
          <div
            key={anomaly.timestamp + anomaly.metric + i}
            className={`flex items-start gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border} transition-all hover:scale-[1.01]`}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center shrink-0 pt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
              {i < anomalies.length - 1 && (
                <div className="w-px flex-1 bg-dark-700/50 mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <div className={`p-1 rounded ${colors.bg}`}>
                  <MetricIcon className={`w-3 h-3 ${colors.text}`} />
                </div>
                <span className={`text-xs font-semibold ${colors.text}`}>
                  {anomaly.server}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                  {anomaly.severity}
                </span>
                <span className={`ml-auto text-[10px] font-mono ${isHigh ? 'text-danger' : 'text-success'}`}>
                  {isHigh ? (
                    <span className="flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> {anomaly.current_value}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <TrendingDown className="w-3 h-3" /> {anomaly.current_value}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1">
                <span className="font-medium">{METRIC_LABELS[anomaly.metric] || anomaly.metric}</span>
                <span>Expected: {expectedLow}–{expectedHigh}</span>
                <span>Baseline: {anomaly.baseline_mean} ±{anomaly.baseline_stddev}</span>
                <span>z-score: {anomaly.z_score}</span>
                <span className="ml-auto">{formatDate(anomaly.timestamp)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Baseline Stats Table ────────────────────────────────────────────────

function BaselineTable({ baselines }) {
  const [sortKey, setSortKey] = useState('server');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMetric, setFilterMetric] = useState('all');

  const sorted = useMemo(() => {
    let filtered = baselines;
    if (filterMetric !== 'all') {
      filtered = baselines.filter((b) => b.metric === filterMetric);
    }

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'server') cmp = a.server.localeCompare(b.server);
      else if (sortKey === 'metric') cmp = a.metric.localeCompare(b.metric);
      else if (sortKey === 'mean') cmp = a.mean - b.mean;
      else if (sortKey === 'stddev') cmp = a.stddev - b.stddev;
      else if (sortKey === 'samples') cmp = a.sample_size - b.sample_size;
      else if (sortKey === 'anomalies') cmp = (a.anomalies_detected || 0) - (b.anomalies_detected || 0);
      return sortAsc ? cmp : -cmp;
    });
  }, [baselines, sortKey, sortAsc, filterMetric]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortArrow = ({ colKey }) => {
    if (sortKey !== colKey) return null;
    return <span className="ml-1 text-[9px]">{sortAsc ? '▲' : '▼'}</span>;
  };

  const uniqueMetrics = useMemo(() => {
    return [...new Set(baselines.map((b) => b.metric))];
  }, [baselines]);

  if (baselines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <BarChart3 className="w-10 h-10 text-gray-600" />
        <p className="text-sm text-gray-500">No baselines established yet</p>
        <p className="text-xs text-gray-600 text-center max-w-xs">
          Baselines are learned automatically as metric data accumulates — typically after 5+ data points per server per metric.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-gray-500">Filter:</span>
        <div className="flex items-center gap-1 bg-dark-800 rounded-md p-0.5">
          <button
            onClick={() => setFilterMetric('all')}
            className={`px-2 py-0.5 text-[10px] rounded transition-all ${
              filterMetric === 'all'
                ? 'bg-accent-500/20 text-accent-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {uniqueMetrics.map((m) => (
            <button
              key={m}
              onClick={() => setFilterMetric(m)}
              className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                filterMetric === m
                  ? 'bg-accent-500/20 text-accent-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {METRIC_LABELS[m] || m}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-600 ml-auto">{sorted.length} baselines</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-dark-700/50">
              <th className="text-left py-2 pr-3 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('server')}>
                Server <SortArrow colKey="server" />
              </th>
              <th className="text-left py-2 pr-3 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('metric')}>
                Metric <SortArrow colKey="metric" />
              </th>
              <th className="text-left py-2 pr-3 font-medium">Hour</th>
              <th className="text-right py-2 pr-3 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('mean')}>
                Mean <SortArrow colKey="mean" />
              </th>
              <th className="text-right py-2 pr-3 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('stddev')}>
                StdDev <SortArrow colKey="stddev" />
              </th>
              <th className="text-right py-2 pr-3 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('samples')}>
                Samples <SortArrow colKey="samples" />
              </th>
              <th className="text-right py-2 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('anomalies')}>
                Anomalies <SortArrow colKey="anomalies" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700/30">
            {sorted.map((b, i) => {
              const MetricIcon = METRIC_ICONS[b.metric] || Activity;

              // Color-coded mean indicator
              const meanColor =
                b.mean > 80 ? 'text-danger' :
                b.mean > 60 ? 'text-warning' :
                'text-gray-300';

              // StdDev indicator
              const stddevColor =
                b.stddev > 20 ? 'text-warning' :
                b.stddev > 10 ? 'text-gray-300' :
                'text-success';

              return (
                <tr key={`${b.server}:${b.metric}:${b.hour}:${i}`} className="hover:bg-dark-800/30 transition-colors">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                      <span className="text-gray-200">{b.server}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <MetricIcon className="w-3 h-3 text-gray-500" />
                      <span className="text-gray-400">{METRIC_LABELS[b.metric] || b.metric}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-gray-500 font-mono">{b.hour}:00</span>
                  </td>
                  <td className={`py-2 pr-3 text-right font-mono ${meanColor}`}>
                    {b.mean}
                  </td>
                  <td className={`py-2 pr-3 text-right font-mono ${stddevColor}`}>
                    ±{b.stddev}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-gray-400">
                    {b.sample_size}
                  </td>
                  <td className="py-2 text-right">
                    {b.anomalies_detected > 0 ? (
                      <span className="text-danger font-bold font-mono">{b.anomalies_detected}</span>
                    ) : (
                      <span className="text-gray-600 font-mono">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function AnomalyDetection() {
  const [summary, setSummary] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('anomalies'); // 'anomalies' | 'baselines'
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);

    try {
      const [summaryRes, anomaliesRes, baselinesRes] = await Promise.all([
        fetch(`${API_BASE}/anomalies/summary`),
        fetch(`${API_BASE}/anomalies`),
        fetch(`${API_BASE}/anomalies/baselines`),
      ]);

      if (!summaryRes.ok || !anomaliesRes.ok || !baselinesRes.ok) {
        throw new Error('Failed to fetch anomaly data');
      }

      const summaryData = await summaryRes.json();
      const anomaliesData = await anomaliesRes.json();
      const baselinesData = await baselinesRes.json();

      setSummary(summaryData);
      setAnomalies(anomaliesData.anomalies || []);
      setBaselines(baselinesData.baselines || []);
    } catch (err) {
      console.error('Failed to fetch anomaly data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 30s
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Derived metrics ────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (!summary) return { totalBaselines: 0, totalAnomalies: 0, recentAnomalies: 0, trackedMetrics: [] };
    return {
      totalBaselines: summary.total_baselines || 0,
      totalAnomalies: summary.total_anomalies_detected || 0,
      recentAnomalies: summary.anomalies_last_hour || 0,
      trackedMetrics: summary.metrics_tracked || [],
    };
  }, [summary]);

  const uniqueServersWithBaselines = useMemo(() => {
    return [...new Set(baselines.map((b) => b.server))];
  }, [baselines]);

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Anomaly Detection</h1>
          <p className="text-sm text-gray-400 mt-1">Loading anomaly detection data...</p>
        </div>
        <AnomalySkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Anomaly Detection</h1>
          <p className="text-sm text-gray-400 mt-1">
            Statistical deviation monitoring · {metrics.totalBaselines} baselines · {uniqueServersWithBaselines.length} servers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[10px] text-danger">{error}</span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700/50 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Total Baselines</span>
            <Layers className="w-4 h-4 text-accent-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">{metrics.totalBaselines}</p>
          <p className="text-[10px] text-gray-600 mt-1">Learned patterns across all servers</p>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Total Anomalies</span>
            <AlertTriangle className="w-4 h-4 text-danger" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">{metrics.totalAnomalies}</p>
          <p className="text-[10px] text-gray-600 mt-1">All-time detections</p>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Last Hour</span>
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <p className={`text-2xl font-bold font-mono ${metrics.recentAnomalies > 0 ? 'text-danger' : 'text-success'}`}>
            {metrics.recentAnomalies}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">Anomalies in the last 60 minutes</p>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Tracked Metrics</span>
            <Activity className="w-4 h-4 text-info" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            {metrics.trackedMetrics.map((m) => {
              const Icon = METRIC_ICONS[m] || Activity;
              return (
                <div key={m} className="flex items-center gap-1 p-1.5 rounded bg-dark-800/50" title={METRIC_LABELS[m] || m}>
                  <Icon className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[10px] text-gray-500">{METRIC_LABELS[m] || m}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">Baselines per server per hour</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center border-b border-dark-700/50">
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
            activeTab === 'anomalies'
              ? 'text-accent-500 border-accent-500'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Anomaly Timeline
          {metrics.recentAnomalies > 0 && (
            <span className="bg-danger/20 text-danger text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1">
              {metrics.recentAnomalies}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('baselines')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
            activeTab === 'baselines'
              ? 'text-accent-500 border-accent-500'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Learned Baselines
          <span className="text-[10px] text-gray-600 ml-1">({baselines.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'anomalies' ? (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-500" />
              <h3 className="text-sm font-medium text-gray-200">Anomaly Timeline</h3>
              <span className="text-[10px] text-gray-500">
                ({anomalies.length} detection{anomalies.length !== 1 ? 's' : ''})
              </span>
            </div>
            {anomalies.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-danger" /> Critical
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-warning" /> Warning
                </span>
              </div>
            )}
          </div>
          <AnomalyTimeline anomalies={anomalies} />
        </div>
      ) : (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent-500" />
              <h3 className="text-sm font-medium text-gray-200">Learned Baselines</h3>
              <span className="text-[10px] text-gray-500">
                ({uniqueServersWithBaselines.length} servers · {baselines.length} total)
              </span>
            </div>
          </div>
          <BaselineTable baselines={baselines} />
        </div>
      )}

      {/* Info footer */}
      <div className="glass-card p-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-info/10">
            <Search className="w-4 h-4 text-info" />
          </div>
          <div className="text-[11px] text-gray-400 leading-relaxed">
            <strong className="text-gray-300">How anomaly detection works:</strong> The system maintains statistical baselines per server, per metric, per hour of day.
            Each new data point is scored using a z-score calculation. Points exceeding a threshold of 2.5 standard deviations from the mean are flagged as anomalies.
            Baselines require at least 5 data points before becoming active and use a rolling 30-sample window.
            A 15-minute cooldown prevents alert storms for the same server+metric combination.
          </div>
        </div>
      </div>
    </div>
  );
}
