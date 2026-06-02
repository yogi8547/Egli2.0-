import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServerCard from '../ServerCard';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock Recharts
vi.mock('recharts', () => ({
  AreaChart: ({ children }) => <div data-testid="mocked-area-chart">{children}</div>,
  Area: () => <div data-testid="mocked-area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="mocked-container">{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  LineChart: () => null,
  Bar: () => null,
  BarChart: () => null,
}));

// Mock the animated number hook
vi.mock('../../hooks/useAnimatedNumber', () => ({
  useAnimatedNumber: (val) => (typeof val === 'number' ? val : 0),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockServer = {
  id: 'srv-001',
  name: 'postgres-primary',
  host: '10.0.0.1',
  status: 'online',
  tags: { type: 'database', environment: 'prod' },
};

const mockMetrics = {
  cpu_percent: 72,
  memory_percent: 91,
  disk_percent: 45,
  uptime_seconds: 345600, // 4 days
  network_rx_bytes: 524288000, // ~500 MB
  network_tx_bytes: 262144000, // ~250 MB
};

const mockAlerts = [
  {
    id: 'a1', severity: 'critical', status: 'active', server: 'postgres-primary',
    metric: 'memory_percent', value: 91, threshold: 85,
    message: 'Memory threshold exceeded',
  },
];

const mockMetricHistory = {
  'postgres-primary:cpu': [
    { time: '2025-01-01T00:00:00Z', value: 70 },
    { time: '2025-01-01T00:01:00Z', value: 75 },
    { time: '2025-01-01T00:02:00Z', value: 72 },
  ],
  'postgres-primary:memory': [
    { time: '2025-01-01T00:00:00Z', value: 85 },
    { time: '2025-01-01T00:01:00Z', value: 90 },
    { time: '2025-01-01T00:02:00Z', value: 91 },
  ],
};

const noAlertsFixture = [];

describe('ServerCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('API not available'));
  });

  // ── Basic Rendering ─────────────────────────────────────────────────

  it('renders server name and host', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText('postgres-primary')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  it('renders server ID', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    expect(screen.getByText('srv-001')).toBeInTheDocument();
  });

  it('renders uptime duration', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    expect(screen.getByText(/Uptime:/)).toBeInTheDocument();
    expect(screen.getByText(/4d/)).toBeInTheDocument();
  });

  it('renders metric gauges', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    // The gauge labels are shown as text
    expect(screen.getAllByText('CPU').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Memory').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Disk').length).toBeGreaterThanOrEqual(1);
  });

  it('renders network stats', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    expect(screen.getByText('Network')).toBeInTheDocument();
    // 524288000 / 1e6 = 524.288 -> toFixed(1) = 524.3
    expect(screen.getByText(/524\.3 MB/)).toBeInTheDocument(); // RX
    // 262144000 / 1e6 = 262.144 -> toFixed(1) = 262.1
    expect(screen.getByText(/262\.1 MB/)).toBeInTheDocument(); // TX
  });

  // ── Status Indicators ──────────────────────────────────────────────

  it('shows alert badge when critical alerts exist', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={mockAlerts}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    // Should show the alert count badge
    const badge = screen.getByText('1');
    expect(badge).toBeInTheDocument();
  });

  // ── Expand/Collapse ─────────────────────────────────────────────────

  it('shows expand button', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    expect(expandBtn).toBeInTheDocument();
  });

  it('shows expanded details when clicked', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    expect(screen.getByText('Metric History')).toBeInTheDocument();
    expect(screen.getByText('Test Connection')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('shows metric history charts when expanded with data', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={mockMetricHistory}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    // The MetricSparkline sections should render their labels
    const cpuLabels = screen.getAllByText('CPU');
    const memLabels = screen.getAllByText('Memory');
    expect(cpuLabels.length).toBeGreaterThanOrEqual(2); // One in gauge, one in history
    expect(memLabels.length).toBeGreaterThanOrEqual(2);
  });

  // ── Delete Confirmation Flow ────────────────────────────────────────

  it('shows delete confirmation when Remove is clicked', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const removeBtn = screen.getByText('Remove');
    fireEvent.click(removeBtn);

    expect(screen.getByText('Remove this server?')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('calls onDelete when delete is confirmed', async () => {
    const onDelete = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Deleted' }),
    });

    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
        onDelete={onDelete}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const removeBtn = screen.getByText('Remove');
    fireEvent.click(removeBtn);

    const yesBtn = screen.getByText('Yes');
    fireEvent.click(yesBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it('cancels delete when No is clicked', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const removeBtn = screen.getByText('Remove');
    fireEvent.click(removeBtn);

    const noBtn = screen.getByText('No');
    fireEvent.click(noBtn);

    expect(screen.queryByText('Remove this server?')).not.toBeInTheDocument();
  });

  // ── Test Connection ─────────────────────────────────────────────────

  it('shows test connection button in expanded view', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    expect(screen.getByText('Test Connection')).toBeInTheDocument();
  });

  it('shows loading state when testing connection', async () => {
    // Don't resolve the fetch to keep loading
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Testing…')).toBeInTheDocument();
    });
  });

  it('shows success result when test connection succeeds', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Connected successfully',
        sys_name: 'Linux postgres-primary 6.2.0',
        uptime_seconds: 345600,
        duration_ms: 45.2,
      }),
    });

    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Connection Successful')).toBeInTheDocument();
    });
  });

  it('shows failure result when test connection fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Connection refused' }),
    });

    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Connection Failed')).toBeInTheDocument();
    });
  });

  it('dismisses test result when Dismiss is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Connected successfully',
        duration_ms: 45.2,
      }),
    });

    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText('Connection Successful')).not.toBeInTheDocument();
  });

  // ── Callbacks ───────────────────────────────────────────────────────

  it('calls onEdit when Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
        onEdit={onEdit}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    const editBtn = screen.getByText('Edit');
    fireEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledWith(mockServer);
  });

  it('calls onFetchHistory for each metric type when expanded', () => {
    const onFetchHistory = vi.fn();
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={onFetchHistory}
        metricHistory={{}}
      />
    );
    const expandBtn = document.querySelector('[class*="p-1 rounded text-gray-500"]');
    fireEvent.click(expandBtn);

    // MetricSparkline useEffect calls onFetch for each metric
    expect(onFetchHistory).toHaveBeenCalledWith('cpu');
    expect(onFetchHistory).toHaveBeenCalledWith('memory');
  });

  // ── No Alerts ───────────────────────────────────────────────────────

  it('does not show alert badge area when no alerts exist', () => {
    render(
      <ServerCard
        server={mockServer}
        metrics={mockMetrics}
        alerts={noAlertsFixture}
        onFetchHistory={vi.fn()}
        metricHistory={{}}
      />
    );
    // The danger badge with alert count should not be rendered
    const alertBadge = document.querySelector('.bg-danger\\/20');
    expect(alertBadge).toBeNull();
  });
});
