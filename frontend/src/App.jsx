/*
 * Egli2.0 — Main Application
 *
 * Root component that manages:
 * - Active view/panel state (overview, servers, alerts, AI)
 * - WebSocket connection for live metric streaming
 * - Global data state (metrics, alerts, servers)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Layout from './components/Layout';
import SystemOverview from './components/SystemOverview';
import ServerCard from './components/ServerCard';
import MetricChart from './components/MetricChart';
import AlertPanel from './components/AlertPanel';
import AIChat from './components/AIChat';
import SelfHealingPanel from './components/SelfHealingPanel';
import NetworkTopology from './components/NetworkTopology';
import AddServerModal from './components/AddServerModal';
import ImportServersModal from './components/ImportServersModal';
import ForecastCard from './components/ForecastCard';
import AnomalyDetection from './components/AnomalyDetection';
import { Activity, Plus, Server, Upload, Download } from 'lucide-react';
import ParticleBackground from './components/ParticleBackground';
import { ToastProvider, useToast } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';

const API_BASE = '/api';

export default function App() {
  // ── State ────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('overview');
  const [servers, setServers] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [customChecks, setCustomChecks] = useState([]);
  const [metricHistory, setMetricHistory] = useState({});
  const [overview, setOverview] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [cacheStatsLoading, setCacheStatsLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pollRemaining, setPollRemaining] = useState(60);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  // ── Initial Data Fetch ───────────────────────────────────────────────
  useEffect(() => {
    fetchInitialData();
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  // ── Cache stats refresh (shared: manual + auto) ────────────────────
  const refreshCacheStats = useCallback(async () => {
    setCacheStatsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vectors/cache-stats`);
      if (res.ok) {
        const data = await res.json();
        setCacheStats(data);
      }
    } catch {
      // Silently ignore — cache stats aren't critical
    } finally {
      setCacheStatsLoading(false);
    }
  }, []);

  // ── Auto-refresh cache stats every 30s ──────────────────────────────
  useEffect(() => {
    const interval = setInterval(refreshCacheStats, 30000);
    return () => clearInterval(interval);
  }, [refreshCacheStats]);

  async function fetchInitialData() {
    try {
      const [serversRes, overviewRes, alertsRes, cacheRes] = await Promise.all([
        fetch(`${API_BASE}/servers`),
        fetch(`${API_BASE}/overview`),
        fetch(`${API_BASE}/alerts`),
        fetch(`${API_BASE}/vectors/cache-stats`),
      ]);

      const serversData = await serversRes.json();
      const overviewData = await overviewRes.json();
      const alertsData = await alertsRes.json();
      const cacheData = await cacheRes.json();

      setServers(serversData.servers || []);
      setOverview(overviewData);
      setAlerts(alertsData.alerts || []);
      setCacheStats(cacheData);
      setCacheStatsLoading(false);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch initial data:', err);
      setCacheStatsLoading(false);
      setLoading(false);
    }
  }

  // ── WebSocket Connection ─────────────────────────────────────────────
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/metrics`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected, reconnecting in 5s...');
      reconnectTimer.current = setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };

    wsRef.current = ws;
  }

  function handleWsMessage(data) {
    if (data.type === 'metrics_update') {
      // Index metrics by server name
      const metricsMap = {};
      (data.metrics || []).forEach((m) => {
        metricsMap[m.server] = m;
      });
      setMetrics((prev) => ({ ...prev, ...metricsMap }));

      if (data.alerts) {
        setAlerts(data.alerts);
      }

      if (data.custom_check_results) {
        setCustomChecks(data.custom_check_results);
      }

      if (data.new_alerts && data.new_alerts.length > 0) {
        if (window.__toast?.addToast) {
          data.new_alerts.forEach((alert) => {
            window.__toast.addToast({
              type: alert.severity === 'critical' ? 'critical' : 'warning',
              title: `${alert.severity.toUpperCase()}: ${alert.server}`,
              message: alert.message,
              duration: 8000,
            });
          });
        }
      }
    } else if (data.type === 'server_update') {
      setMetrics((prev) => ({
        ...prev,
        [data.server]: data.metrics,
      }));
    } else if (data.type === 'server_event') {
      // Real-time server CRUD notifications
      handleServerEvent(data.event, data.server);
    } else if (data.type === 'server_status_change') {
      // Real-time server status change notification
      handleStatusChange(data.server_id, data.old_status, data.new_status);
    }
  }

  function handleServerEvent(event, server) {
    if (event === 'added') {
      setServers((prev) => {
        if (prev.some((s) => s.id === server.id)) return prev;
        return [...prev, server];
      });
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'info',
          title: 'Server Added',
          message: `${server.name} (${server.host}) registered`,
          duration: 4000,
        });
      }
    } else if (event === 'updated') {
      setServers((prev) => prev.map((s) => (s.id === server.id ? server : s)));
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'info',
          title: 'Server Updated',
          message: `${server.name} configuration changed`,
          duration: 4000,
        });
      }
    } else if (event === 'deleted') {
      setServers((prev) => prev.filter((s) => s.id !== server.id));
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'warning',
          title: 'Server Removed',
          message: `${server.name} unregistered from monitoring`,
          duration: 4000,
        });
      }
    }
  }

  function handleStatusChange(serverId, oldStatus, newStatus) {
    setServers((prev) =>
      prev.map((s) => (s.id === serverId ? { ...s, status: newStatus } : s))
    );
    if (newStatus === 'offline' && oldStatus !== 'offline') {
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'critical',
          title: 'Server Offline',
          message: `Server ${serverId} went from ${oldStatus} to offline`,
          duration: 8000,
        });
      }
    }
  }

  // ── Metric History Fetch ─────────────────────────────────────────────
  const fetchHistory = useCallback(async (server, measurement) => {
    try {
      const res = await fetch(
        `${API_BASE}/metrics/history/${server}/${measurement}?hours=1&limit=60`
      );
      const data = await res.json();
      setMetricHistory((prev) => ({
        ...prev,
        [`${server}:${measurement}`]: data.points || [],
      }));
    } catch (err) {
      console.error(`Failed to fetch history for ${server}/${measurement}:`, err);
    }
  }, []);

  // ── Poll countdown ───────────────────────────────────────────────────
  useEffect(() => {
    setPollRemaining(60);
    const timer = setInterval(() => {
      setPollRemaining((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Active Alert Count ───────────────────────────────────────────────
  const activeAlertCount = alerts.filter((a) => a.status === 'active').length;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <ThemeProvider>
    <ToastProvider>
      <ToastConnector />
      <ParticleBackground intensity={1} />
      <Layout
        activeView={activeView}
        onNavigate={setActiveView}
        connected={connected}
        alertCount={activeAlertCount}
        pollRemaining={pollRemaining}
        pollInterval={60}
        servers={servers}
        metrics={metrics}
        alerts={alerts}
      >
      {activeView === 'overview' && (
        <SystemOverview
          overview={overview}
          servers={servers}
          metrics={metrics}
          alerts={alerts}
          customChecks={customChecks}
          cacheStats={cacheStats}
          cacheStatsLoading={cacheStatsLoading}
          onRefreshCache={refreshCacheStats}
          onViewChange={setActiveView}
          loading={loading}
        />
      )}

      {activeView === 'servers' && !loading && (
        <ServerGrid
          servers={servers}
          metrics={metrics}
          alerts={alerts}
          customChecks={customChecks}
          onFetchHistory={fetchHistory}
          metricHistory={metricHistory}
          onAddServer={fetchInitialData}
        />
      )}

      {activeView === 'alerts' && !loading && (
        <AlertPanel
          alerts={alerts}
          onRefresh={fetchInitialData}
        />
      )}

      {activeView === 'ai' && !loading && (
        <AIChat servers={servers} metrics={metrics} alerts={alerts} />
      )}

      {activeView === 'network' && !loading && (
        <NetworkTopology
          servers={servers}
          metrics={metrics}
          alerts={alerts}
        />
      )}

      {activeView === 'anomalies' && !loading && (
        <AnomalyDetection />
      )}

      {activeView === 'self-healing' && !loading && (
        <SelfHealingPanel />
      )}

      {activeView === 'forecasts' && !loading && (
        <ForecastView servers={servers} />
      )}
    </Layout>
    </ToastProvider>
    </ThemeProvider>
  );
}

// ── Connect Toast to global for use outside React tree ────────────────
function ToastConnector() {
  const toast = useToast();
  useEffect(() => {
    window.__toast = toast;
    return () => { window.__toast = null; };
  }, [toast]);
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────

function ForecastView({ servers }) {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchForecasts() {
      try {
        const res = await fetch('/api/forecasts');
        const data = await res.json();
        setForecasts(data.forecasts || []);
      } catch (err) {
        console.error('Failed to fetch forecasts:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchForecasts();
    const interval = setInterval(fetchForecasts, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-gray-500">
          <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading forecasts...</span>
        </div>
      </div>
    );
  }

  // Group forecasts by server
  const byServer = {};
  forecasts.forEach((f) => {
    if (!byServer[f.server]) byServer[f.server] = [];
    byServer[f.server].push(f);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Predictive Forecasts</h1>
        <p className="text-sm text-gray-400 mt-1">
          AI-powered trend analysis and capacity planning — {forecasts.length} metrics tracked
        </p>
      </div>

      {Object.entries(byServer).length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-3">
          <Activity className="w-12 h-12 text-gray-600" />
          <p className="text-gray-400 text-sm">No forecast data yet</p>
          <p className="text-gray-600 text-xs">Data accumulates after a few polling cycles</p>
        </div>
      ) : (
        Object.entries(byServer).map(([server, fc]) => (
          <ForecastCard key={server} server={server} forecasts={fc} />
        ))
      )}
    </div>
  );
}

function ServerGrid({ servers, metrics, alerts, customChecks, onFetchHistory, metricHistory, onAddServer }) {
  // Filter alerts by server
  const alertsByServer = {};
  (alerts || []).forEach((a) => {
    if (!alertsByServer[a.server]) alertsByServer[a.server] = [];
    alertsByServer[a.server].push(a);
  });

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState(null); // { key, value } or null

  // ── Extract unique tags with counts ─────────────────────────────────
  const tagFilters = useMemo(() => {
    const tagMap = new Map(); // "key=value" -> count
    (servers || []).forEach((srv) => {
      if (srv.tags) {
        Object.entries(srv.tags).forEach(([key, value]) => {
          const keyval = `${key}=${value}`;
          tagMap.set(keyval, (tagMap.get(keyval) || 0) + 1);
        });
      }
    });
    return Array.from(tagMap.entries())
      .map(([keyval, count]) => {
        const eqIdx = keyval.indexOf('=');
        return { key: keyval.slice(0, eqIdx), value: keyval.slice(eqIdx + 1), keyval, count };
      })
      .sort((a, b) => b.count - a.count); // most common tags first
  }, [servers]);

  // ── Filter servers by active tag ───────────────────────────────────
  const filteredServers = useMemo(() => {
    if (!activeTagFilter) return servers;
    return (servers || []).filter((srv) =>
      srv.tags && srv.tags[activeTagFilter.key] === activeTagFilter.value
    );
  }, [servers, activeTagFilter]);

  const hasActiveFilter = activeTagFilter !== null;

  // ── Export servers as JSON file ────────────────────────────────────
  async function handleExport() {
    try {
      const res = await fetch('/api/servers/export');
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `servers-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'success',
          title: 'Exported',
          message: `${data.length} server${data.length !== 1 ? 's' : ''} exported to JSON`,
          duration: 4000,
        });
      }
    } catch (err) {
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'critical',
          title: 'Export Failed',
          message: err.message,
          duration: 6000,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Servers</h1>
          <p className="text-sm text-gray-400 mt-1">
            {hasActiveFilter
              ? `${filteredServers.length} of ${servers.length} server${servers.length !== 1 ? 's' : ''}`
              : `${servers.length} server${servers.length !== 1 ? 's' : ''} registered`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {servers.length > 0 && (
            <>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700/50 rounded-lg transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <button
                onClick={() => setImportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700/50 rounded-lg transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                Import
              </button>
            </>
          )}
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-accent-500 bg-accent-500/10 hover:bg-accent-500/20 border border-accent-500/20 rounded-lg transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Server
          </button>
          <div className="flex items-center gap-2">
            <span className="status-dot online" />
            <span className="text-xs text-gray-400">
              {servers.length} online
            </span>
          </div>
        </div>
      </div>

      <AddServerModal
        isOpen={addModalOpen || Boolean(editingServer)}
        onClose={() => { setAddModalOpen(false); setEditingServer(null); }}
        onServerAdded={onAddServer}
        editServer={editingServer}
      />

      <ImportServersModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={onAddServer}
      />

      {/* ── Tag filter bar ────────────────────────────────────────────── */}
      {tagFilters.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTagFilter(null)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
              !hasActiveFilter
                ? 'bg-accent-500/20 text-accent-500 border border-accent-500/30'
                : 'text-gray-500 border border-dark-700/30 hover:text-gray-300 hover:border-dark-600/50'
            }`}
          >
            All Servers
          </button>
          {tagFilters.map((tag) => (
            <button
              key={tag.keyval}
              onClick={() => setActiveTagFilter(
                hasActiveFilter && activeTagFilter.key === tag.key && activeTagFilter.value === tag.value
                  ? null
                  : { key: tag.key, value: tag.value }
              )}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                hasActiveFilter && activeTagFilter.key === tag.key && activeTagFilter.value === tag.value
                  ? 'bg-accent-500/20 text-accent-500 border border-accent-500/30'
                  : 'text-gray-500 border border-dark-700/30 hover:text-gray-300 hover:border-dark-600/50'
              }`}
            >
              <span className="text-[9px] opacity-60 mr-1">{tag.key}=</span>
              <span>{tag.value}</span>
              <span className="ml-1 text-[9px] opacity-50">{tag.count}</span>
            </button>
          ))}
          {hasActiveFilter && (
            <button
              onClick={() => setActiveTagFilter(null)}
              className="px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-all"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* ── Server cards grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredServers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            metrics={metrics[server.name] || metrics[server.id]}
            alerts={alertsByServer[server.name] || []}
            customChecks={(customChecks || []).filter(
              (c) => c.server === server.name || c.server === server.id
            )}
            onFetchHistory={(measurement) =>
              onFetchHistory(server.name, measurement)
            }
            metricHistory={metricHistory}
            onDelete={onAddServer}
            onEdit={(server) => { setEditingServer(server); }}
          />
        ))}
      </div>

      {filteredServers.length === 0 && servers.length === 0 && (
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-3">
          <Server className="w-10 h-10 text-gray-600" />
          <p className="text-gray-400 text-sm">No servers registered</p>
          <p className="text-gray-600 text-xs">
            Click "Add Server" to register your first SNMP monitoring target
          </p>
        </div>
      )}

      {filteredServers.length === 0 && servers.length > 0 && (
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-3">
          <Server className="w-10 h-10 text-gray-600" />
          <p className="text-gray-400 text-sm">No servers match this filter</p>
          <p className="text-gray-600 text-xs">
            Try selecting a different tag, or{' '}
            <button
              onClick={() => setActiveTagFilter(null)}
              className="text-accent-500 hover:text-accent-400 underline"
            >
              clear the filter
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
