/*
 * Egli2.0 — Main Application
 *
 * Root component that manages:
 * - Active view/panel state (overview, servers, alerts, AI)
 * - WebSocket connection for live metric streaming
 * - Global data state (metrics, alerts, servers)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import SystemOverview from './components/SystemOverview';
import ServerCard from './components/ServerCard';
import MetricChart from './components/MetricChart';
import AlertPanel from './components/AlertPanel';
import AIChat from './components/AIChat';
import SelfHealingPanel from './components/SelfHealingPanel';
import ForecastCard from './components/ForecastCard';
import { Activity } from 'lucide-react';
import ParticleBackground from './components/ParticleBackground';
import { ToastProvider, useToast } from './components/Toast';

const API_BASE = '/api';

export default function App() {
  // ── State ────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('overview');
  const [servers, setServers] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [metricHistory, setMetricHistory] = useState({});
  const [overview, setOverview] = useState(null);
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

  async function fetchInitialData() {
    try {
      const [serversRes, overviewRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/servers`),
        fetch(`${API_BASE}/overview`),
        fetch(`${API_BASE}/alerts`),
      ]);

      const serversData = await serversRes.json();
      const overviewData = await overviewRes.json();
      const alertsData = await alertsRes.json();

      setServers(serversData.servers || []);
      setOverview(overviewData);
      setAlerts(alertsData.alerts || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch initial data:', err);
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
      >
      {loading ? (
        <LoadingScreen />
      ) : (
        <>
          {activeView === 'overview' && (
            <SystemOverview
              overview={overview}
              servers={servers}
              metrics={metrics}
              alerts={alerts}
              onViewChange={setActiveView}
            />
          )}

          {activeView === 'servers' && (
            <ServerGrid
              servers={servers}
              metrics={metrics}
              alerts={alerts}
              onFetchHistory={fetchHistory}
              metricHistory={metricHistory}
            />
          )}

          {activeView === 'alerts' && (
            <AlertPanel
              alerts={alerts}
              onRefresh={fetchInitialData}
            />
          )}

          {activeView === 'ai' && (
            <AIChat servers={servers} metrics={metrics} alerts={alerts} />
          )}

          {activeView === 'self-healing' && (
            <SelfHealingPanel />
          )}

          {activeView === 'forecasts' && (
            <ForecastView servers={servers} />
          )}
        </>
      )}
    </Layout>
    </ToastProvider>
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

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-dark-600 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-accent-500 rounded-full animate-spin" />
      </div>
      <p className="text-gray-400 font-mono text-sm animate-pulse">
        Initializing monitoring systems...
      </p>
    </div>
  );
}

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

function ServerGrid({ servers, metrics, alerts, onFetchHistory, metricHistory }) {
  // Filter alerts by server
  const alertsByServer = {};
  (alerts || []).forEach((a) => {
    if (!alertsByServer[a.server]) alertsByServer[a.server] = [];
    alertsByServer[a.server].push(a);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Servers</h1>
          <p className="text-sm text-gray-400 mt-1">
            {servers.length} servers registered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="status-dot online" />
          <span className="text-xs text-gray-400">
            {servers.length} online
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            metrics={metrics[server.name] || metrics[server.id]}
            alerts={alertsByServer[server.name] || []}
            onFetchHistory={(measurement) =>
              onFetchHistory(server.name, measurement)
            }
            metricHistory={metricHistory}
          />
        ))}
      </div>
    </div>
  );
}
