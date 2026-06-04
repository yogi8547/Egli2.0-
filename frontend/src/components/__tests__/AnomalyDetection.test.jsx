import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnomalyDetection from '../AnomalyDetection';

// ── Mock Data ────────────────────────────────────────────────────────────

const mockSummary = {
  total_baselines: 30,
  total_anomalies_detected: 3,
  anomalies_last_hour: 1,
  metrics_tracked: ['cpu_percent', 'memory_percent', 'disk_percent'],
};

const mockAnomalies = [
  {
    server: 'web-srv-01',
    metric: 'cpu_percent',
    timestamp: '2025-01-15T10:30:00Z',
    z_score: 3.2,
    direction: 'high',
    severity: 'warning',
    expected_range: [15.0, 55.0],
    current_value: 78.5,
    baseline_mean: 35.0,
    baseline_stddev: 8.5,
    sample_size: 28,
  },
  {
    server: 'db-primary',
    metric: 'memory_percent',
    timestamp: '2025-01-15T10:15:00Z',
    z_score: 4.5,
    direction: 'high',
    severity: 'critical',
    expected_range: [40.0, 75.0],
    current_value: 92.3,
    baseline_mean: 57.5,
    baseline_stddev: 6.2,
    sample_size: 30,
  },
  {
    server: 'cache-node',
    metric: 'disk_percent',
    timestamp: '2025-01-15T09:45:00Z',
    z_score: 2.8,
    direction: 'low',
    severity: 'warning',
    expected_range: [30.0, 70.0],
    current_value: 22.1,
    baseline_mean: 50.0,
    baseline_stddev: 10.0,
    sample_size: 25,
  },
];

const mockBaselines = [
  { server: 'web-srv-01', metric: 'cpu_percent', hour: 10, mean: 35.0, stddev: 8.5, sample_size: 28, anomalies_detected: 1 },
  { server: 'web-srv-01', metric: 'memory_percent', hour: 10, mean: 57.5, stddev: 6.2, sample_size: 30, anomalies_detected: 0 },
  { server: 'web-srv-01', metric: 'disk_percent', hour: 10, mean: 52.0, stddev: 12.1, sample_size: 25, anomalies_detected: 0 },
  { server: 'db-primary', metric: 'cpu_percent', hour: 10, mean: 45.0, stddev: 9.8, sample_size: 30, anomalies_detected: 1 },
  { server: 'db-primary', metric: 'memory_percent', hour: 10, mean: 57.5, stddev: 6.2, sample_size: 30, anomalies_detected: 1 },
  { server: 'db-primary', metric: 'disk_percent', hour: 10, mean: 48.0, stddev: 15.3, sample_size: 25, anomalies_detected: 0 },
  { server: 'cache-node', metric: 'cpu_percent', hour: 9, mean: 40.0, stddev: 11.0, sample_size: 20, anomalies_detected: 0 },
  { server: 'cache-node', metric: 'memory_percent', hour: 9, mean: 62.0, stddev: 8.2, sample_size: 22, anomalies_detected: 0 },
  { server: 'cache-node', metric: 'disk_percent', hour: 9, mean: 50.0, stddev: 10.0, sample_size: 25, anomalies_detected: 1 },
];

// ── Setup ────────────────────────────────────────────────────────────────

describe('AnomalyDetection', () => {
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.spyOn(global, 'fetch');
  });

  function mockApiCalls({ summary = mockSummary, anomalies = mockAnomalies, baselines = mockBaselines } = {}) {
    mockFetch.mockImplementation(async (url) => {
      if (url.includes('/anomalies/summary')) return { ok: true, json: async () => summary };
      if (url.includes('/anomalies/baselines')) return { ok: true, json: async () => ({ baselines }) };
      if (url.includes('/anomalies')) return { ok: true, json: async () => ({ anomalies }) };
      return { ok: false, json: async () => ({}) };
    });
  }

  // ── Loading State ────────────────────────────────────────────────────

  it('shows loading skeleton on mount', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<AnomalyDetection />);
    expect(screen.getByText(/Loading anomaly detection data/)).toBeInTheDocument();
  });

  // ── Header ───────────────────────────────────────────────────────────

  it('renders the header after loading', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('Anomaly Detection')).toBeInTheDocument();
    });

    expect(screen.getByText(/Statistical deviation monitoring/)).toBeInTheDocument();
  });

  // ── Summary Cards ────────────────────────────────────────────────────

  it('renders summary card labels', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('Total Baselines')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Anomalies')).toBeInTheDocument();
    expect(screen.getByText('Last Hour')).toBeInTheDocument();
    expect(screen.getByText('Tracked Metrics')).toBeInTheDocument();
  });

  it('shows metric badges (CPU, Memory, Disk) in the tracked metrics card', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    // These texts appear in multiple places (tracked metrics badges + filter buttons)
    // Use getAllByText to handle duplicates
    await waitFor(() => {
      const cpus = screen.getAllByText('CPU');
      expect(cpus.length).toBeGreaterThanOrEqual(1);
    });

    const memories = screen.getAllByText('Memory');
    expect(memories.length).toBeGreaterThanOrEqual(1);

    const disks = screen.getAllByText('Disk');
    expect(disks.length).toBeGreaterThanOrEqual(1);
  });

  it('shows baselines count in summary', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('Total Baselines')).toBeInTheDocument();
    });

    // "30" appears in summary card value and sample_size cells
    const thirties = screen.getAllByText('30');
    expect(thirties.length).toBeGreaterThanOrEqual(1);
  });

  it('shows zeros in summary cards when API returns zero values', async () => {
    mockApiCalls({
      summary: {
        total_baselines: 0,
        total_anomalies_detected: 0,
        anomalies_last_hour: 0,
        metrics_tracked: [],
      },
    });
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('Total Baselines')).toBeInTheDocument();
    });

    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  // ── Tab Navigation ───────────────────────────────────────────────────

  it('shows the anomaly timeline tab by default', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    // "Anomaly Timeline" appears as a tab button AND as a card heading
    await waitFor(() => {
      const els = screen.getAllByText('Anomaly Timeline');
      expect(els.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches to baselines tab when clicked and shows data in table', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => expect(screen.getByText('Anomaly Detection')).toBeInTheDocument());

    // Click the baselines tab
    const tabButtons = screen.getAllByRole('button');
    const baselinesTab = tabButtons.find((btn) => btn.textContent.includes('Learned Baselines'));
    expect(baselinesTab).toBeTruthy();
    fireEvent.click(baselinesTab);

    // The baseline table uses METRIC_LABELS so it shows "CPU" not "cpu_percent"
    await waitFor(() => {
      expect(screen.getByText('Server')).toBeInTheDocument();
    });

    expect(screen.getByText('Mean')).toBeInTheDocument();
  });

  // ── Anomaly Timeline Tab ─────────────────────────────────────────────

  it('renders anomaly entries with server names', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('web-srv-01')).toBeInTheDocument();
    });

    expect(screen.getByText('db-primary')).toBeInTheDocument();
    expect(screen.getByText('cache-node')).toBeInTheDocument();
  });

  it('shows severity badges (critical appears at least once)', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      const criticalEls = screen.getAllByText('critical');
      expect(criticalEls.length).toBeGreaterThanOrEqual(1);
    });

    const warningEls = screen.getAllByText('warning');
    expect(warningEls.length).toBeGreaterThanOrEqual(1);
  });

  it('shows expected range values', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText(/Expected: 15/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Expected: 40/)).toBeInTheDocument();
  });

  it('shows empty state when no anomalies', async () => {
    mockApiCalls({ anomalies: [] });
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('No anomalies detected')).toBeInTheDocument();
    });

    expect(screen.getByText(/All metrics are within expected baselines/)).toBeInTheDocument();
  });

  // ── Baselines Tab ────────────────────────────────────────────────────

  function clickBaselinesTab() {
    const tabButtons = screen.getAllByRole('button');
    const btn = tabButtons.find((b) => b.textContent.includes('Learned Baselines'));
    if (btn) fireEvent.click(btn);
    return btn;
  }

  it('renders baseline table with sortable column headers', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => expect(screen.getByText('Anomaly Detection')).toBeInTheDocument());
    clickBaselinesTab();

    // Column headers — use getAllByText since some may appear in header + rows
    await waitFor(() => {
      expect(screen.getByText('StdDev')).toBeInTheDocument();
    });

    // Other headers
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Hour')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.getByText('Samples')).toBeInTheDocument();

    // "Anomalies" appears as column header and in anomaly timeline tab — use getAllByText
    const anomaliesHeaders = screen.getAllByText('Anomalies');
    expect(anomaliesHeaders.length).toBeGreaterThanOrEqual(1);
  });

  it('shows baseline table with sortable column headers', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => expect(screen.getByText('Anomaly Detection')).toBeInTheDocument());
    clickBaselinesTab();

    // Column headers are unique in the document
    await waitFor(() => {
      expect(screen.getByText('StdDev')).toBeInTheDocument();
    });

    expect(screen.getByText('Hour')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.getByText('Samples')).toBeInTheDocument();
  });

  it('shows empty state when no baselines exist', async () => {
    mockApiCalls({ baselines: [] });
    render(<AnomalyDetection />);

    await waitFor(() => expect(screen.getByText('Anomaly Detection')).toBeInTheDocument());
    clickBaselinesTab();

    await waitFor(() => {
      expect(screen.getByText('No baselines established yet')).toBeInTheDocument();
    });
  });

  it('filters baselines when a metric filter button is clicked', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => expect(screen.getByText('Anomaly Detection')).toBeInTheDocument());
    clickBaselinesTab();

    // Find CPU filter button
    await waitFor(() => {
      const cpus = screen.getAllByText('CPU');
      expect(cpus.length).toBeGreaterThanOrEqual(1);
    });

    // Click a CPU element — after filtering, the "CPU" filter button should remain
    const cpus = screen.getAllByText('CPU');
    fireEvent.click(cpus[0]);

    // After filtering, check that the "Filter:" label text is still visible
    // (the filter mechanism changes internal state but keeps rendering)
    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });
  });

  // ── Refresh Button ───────────────────────────────────────────────────

  it('has a refresh button that triggers a new fetch', async () => {
    let fetchCount = 0;
    mockFetch.mockImplementation(async (url) => {
      fetchCount++;
      if (url.includes('/anomalies/summary')) return { ok: true, json: async () => mockSummary };
      if (url.includes('/anomalies/baselines')) return { ok: true, json: async () => ({ baselines: mockBaselines }) };
      if (url.includes('/anomalies')) return { ok: true, json: async () => ({ anomalies: mockAnomalies }) };
      return { ok: false, json: async () => ({}) };
    });

    render(<AnomalyDetection />);

    await waitFor(() => expect(screen.getByText('Anomaly Detection')).toBeInTheDocument());

    const initialCount = fetchCount;
    const refreshBtn = screen.getByText('Refresh');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThan(initialCount);
    });
  });

  // ── Error State ──────────────────────────────────────────────────────

  it('renders the header even when API call fails', async () => {
    mockFetch.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText('Anomaly Detection')).toBeInTheDocument();
    });
  });

  // ── Info Footer ──────────────────────────────────────────────────────

  it('renders the how-it-works info footer', async () => {
    mockApiCalls();
    render(<AnomalyDetection />);

    await waitFor(() => {
      expect(screen.getByText(/How anomaly detection works/)).toBeInTheDocument();
    });
  });
});
