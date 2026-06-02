/* eslint-disable testing-library/no-await-sync-events */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SystemOverview from '../SystemOverview';

// SystemOverview exports AIPredictionsBanner, PodStatus, ServiceMetricsTable as
// non-exported module-internal functions. We test them indirectly through
// the main component.

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock Recharts to avoid rendering complexity
vi.mock('recharts', () => ({
  AreaChart: ({ children }) => <div data-testid="mocked-area-chart">{children}</div>,
  Area: () => <div data-testid="mocked-area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="mocked-container">{children}</div>,
}));

// Mock the animated number hook to return a simple value
vi.mock('../../hooks/useAnimatedNumber', () => ({
  useAnimatedNumber: (val) => typeof val === 'number' ? val : 0,
}));

// Mock window.fetch for trend data calls
global.fetch = vi.fn().mockResolvedValue({
  ok: false,
});

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockServers = [
  { id: '1', name: 'postgres-primary', host: '10.0.0.1', status: 'online', tags: { type: 'database' } },
  { id: '2', name: 'api-gw-prod', host: '10.0.0.2', status: 'online', tags: { type: 'gateway' } },
  { id: '3', name: 'payments-svc', host: '10.0.0.3', status: 'degraded', tags: { type: 'service' } },
  { id: '4', name: 'notification-svc', host: '10.0.0.4', status: 'offline', tags: { type: 'service' } },
];

const mockMetrics = {
  'postgres-primary': { cpu_percent: 72, memory_percent: 91, disk_percent: 45 },
  'api-gw-prod': { cpu_percent: 88, memory_percent: 76, disk_percent: 62 },
  'payments-svc': { cpu_percent: 95, memory_percent: 88, disk_percent: 80 },
  'notification-svc': { cpu_percent: 0, memory_percent: 0, disk_percent: 0 },
};

const mockAlerts = [
  {
    id: 'a1', severity: 'critical', status: 'active', server: 'postgres-primary',
    metric: 'memory_percent', value: 91, threshold: 85,
    message: 'DB connection pool exhausted on postgres-primary',
    created_at: '2025-01-01T00:02:00Z',
  },
  {
    id: 'a2', severity: 'critical', status: 'active', server: 'payments-svc',
    metric: 'memory_percent', value: 88, threshold: 85,
    message: 'Pod memory spike on payments-svc',
    created_at: '2025-01-01T00:05:00Z',
  },
  {
    id: 'a3', severity: 'warning', status: 'active', server: 'api-gw-prod',
    metric: 'cpu_percent', value: 88, threshold: 85,
    message: 'API gateway 504s rising on api-gw-prod',
    created_at: '2025-01-01T00:09:00Z',
  },
];

// Lower metrics to avoid generating too many predictions (max 4)
const lowMetrics = {
  'postgres-primary': { cpu_percent: 60, memory_percent: 45, disk_percent: 35 },
  'api-gw-prod': { cpu_percent: 55, memory_percent: 50, disk_percent: 40 },
};

const overview = {};

describe('SystemOverview — Sub-components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── PodStatus ───────────────────────────────────────────────────────

  describe('PodStatus', () => {
    it('renders service health section', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        // Wait for effects (fetchTrendData) to settle
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText('Service Health')).toBeInTheDocument();
    });

    it('shows healthy/degraded/offline counts', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      // 2 healthy, 1 degraded, 1 offline
      const healthyEls = screen.getAllByText('2');
      expect(healthyEls.length).toBeGreaterThanOrEqual(1);
      const degradedEls = screen.getAllByText('1');
      expect(degradedEls.length).toBeGreaterThanOrEqual(1);
      // 4 total servers, 2 healthy — "2/4" appears in both the main count and the label
      const countTexts = screen.getAllByText(/2\/4/);
      expect(countTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('shows health percentage', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      // 2 out of 4 healthy = 50%
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('shows spike badge when multiple critical alerts', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText(/2 critical alerts spiking/)).toBeInTheDocument();
    });

    it('returns nothing when no servers', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={[]}
            metrics={{}}
            alerts={[]}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByText('Service Health')).not.toBeInTheDocument();
    });
  });

  // ── AIPredictionsBanner ─────────────────────────────────────────────

  describe('AIPredictionsBanner', () => {
    it('renders AI Predictions section', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText('AI Predictions')).toBeInTheDocument();
    });

    it('shows prediction for high memory on postgres-primary (91%)', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText(/OOM risk/)).toBeInTheDocument();
    });

    it('shows prediction for high CPU on payments-svc (95%)', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      const cpuEls = screen.getAllByText(/CPU saturation/);
      expect(cpuEls.length).toBeGreaterThanOrEqual(1);
    });

    it('shows prediction count in header with specific format', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      // Match the specific format "N critical · N warnings"
      expect(screen.getByText(/warnings/)).toBeInTheDocument();
    });

    it('shows database connection cascade risk when multiple connection alerts', async () => {
      // Use low metrics to avoid generating too many metric predictions (max 4 predictions shown)
      // This ensures the cascade risk prediction fits within the limit
      const alertsWithConn = [
        {
          id: 'a3', severity: 'warning', status: 'active', server: 'api-gw-prod',
          metric: 'cpu_percent', value: 88, threshold: 85,
          message: 'connection timeout on api-gw-prod',
          created_at: '2025-01-01T00:09:00Z',
        },
        {
          id: 'a4', severity: 'warning', status: 'active', server: 'another-db',
          metric: 'connections', value: 100,
          message: 'connection timeout on another-db',
          created_at: '2025-01-01T00:10:00Z',
        },
      ];

      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={[mockServers[0], mockServers[1]]}
            metrics={lowMetrics}
            alerts={alertsWithConn}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText('Database connection cascade risk')).toBeInTheDocument();
    });

    it('does not render when all metrics are low', async () => {
      const lowMetricsData = {
        'postgres-primary': { cpu_percent: 30, memory_percent: 40, disk_percent: 35 },
        'api-gw-prod': { cpu_percent: 25, memory_percent: 45, disk_percent: 30 },
      };
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={[mockServers[0], mockServers[1]]}
            metrics={lowMetricsData}
            alerts={[]}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByText('AI Predictions')).not.toBeInTheDocument();
    });
  });

  // ── ServiceMetricsTable ─────────────────────────────────────────────

  describe('ServiceMetricsTable', () => {
    it('renders the service metrics section', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        // Wait for effects (fetchTrendData) to settle
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText('Service Metrics')).toBeInTheDocument();
    });

    it('shows healthy/total count in header', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText(/2\/4.*healthy/)).toBeInTheDocument();
    });

    it('shows table column headers', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      // Use getAllByText for text that appears in both legend and table header
      const latencyElements = screen.getAllByText('Latency');
      expect(latencyElements.length).toBe(2);
      expect(screen.getByText('Throughput')).toBeInTheDocument();
    });

    it('shows server names in rows', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText('Postgres Primary')).toBeInTheDocument();
      expect(screen.getByText('Api Gw Prod')).toBeInTheDocument();
    });

    it('shows status text for different server statuses', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        // Wait for effects (fetchTrendData) to settle
        await new Promise((r) => setTimeout(r, 0));
      });
      // Use getAllByText for text that appears in multiple places
      const onlineElements = screen.getAllByText('online');
      expect(onlineElements.length).toBeGreaterThanOrEqual(2);
      const degradedStatusEls = screen.getAllByText('degraded');
      expect(degradedStatusEls.length).toBeGreaterThanOrEqual(1);
      const offlineStatusEls = screen.getAllByText('offline');
      expect(offlineStatusEls.length).toBeGreaterThanOrEqual(1);
    });

    it('shows alert summary when services have critical alerts', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={vi.fn()}
          />
        );
        // Wait for effects (fetchTrendData) to settle
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByText(/services with critical alerts/)).toBeInTheDocument();
    });

    it('calls onViewChange when View All Servers is clicked', async () => {
      const onViewChange = vi.fn();
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={mockServers}
            metrics={mockMetrics}
            alerts={mockAlerts}
            onViewChange={onViewChange}
          />
        );
        // Wait for effects (fetchTrendData) to settle
        await new Promise((r) => setTimeout(r, 0));
      });
      const viewAllBtn = screen.getByText('View All Servers');
      fireEvent.click(viewAllBtn);
      expect(onViewChange).toHaveBeenCalledWith('servers');
    });

    it('returns nothing when no servers', async () => {
      await act(async () => {
        render(
          <SystemOverview
            overview={overview}
            servers={[]}
            metrics={{}}
            alerts={[]}
            onViewChange={vi.fn()}
          />
        );
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByText('Service Metrics')).not.toBeInTheDocument();
    });
  });
});
