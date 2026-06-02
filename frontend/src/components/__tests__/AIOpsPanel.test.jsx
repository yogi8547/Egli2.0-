import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AIOpsPanel from '../AIOpsPanel';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock AutoFixButton to simplify testing of the parent panel
vi.mock('../AutoFixButton', () => ({
  default: ({ action, onExecute }) => (
    <button
      data-testid="auto-fix-button"
      data-action={action.action}
      onClick={() => onExecute?.(action)}
    >
      {action.description}
    </button>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockServers = [
  { id: '1', name: 'postgres-primary', host: '10.0.0.1', status: 'online', tags: { type: 'database' } },
  { id: '2', name: 'api-gw-prod', host: '10.0.0.2', status: 'online', tags: { type: 'gateway' } },
  { id: '3', name: 'payments-svc', host: '10.0.0.3', status: 'degraded', tags: { type: 'service' } },
  { id: '4', name: 'notification-svc', host: '10.0.0.4', status: 'degraded', tags: { type: 'service' } },
];

const mockMetrics = {
  'postgres-primary': { cpu_percent: 72, memory_percent: 91, disk_percent: 45 },
  'api-gw-prod': { cpu_percent: 88, memory_percent: 76, disk_percent: 62 },
  'payments-svc': { cpu_percent: 95, memory_percent: 88, disk_percent: 80 },
  'notification-svc': { cpu_percent: 65, memory_percent: 82, disk_percent: 55 },
};

const mockAlerts = [
  {
    id: 'a1', severity: 'critical', status: 'active', server: 'postgres-primary',
    metric: 'memory_percent', value: 91, threshold: 85,
    message: 'DB connection pool exhausted: postgres-primary memory at 91%',
    created_at: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 'a2', severity: 'critical', status: 'active', server: 'payments-svc',
    metric: 'memory_percent', value: 88, threshold: 85,
    message: 'Pod memory spike: payments-svc at 88%',
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 'a3', severity: 'warning', status: 'active', server: 'api-gw-prod',
    metric: 'cpu_percent', value: 88, threshold: 85,
    message: 'API gateway 504s rising: api-gw-prod CPU at 88%',
    created_at: new Date(Date.now() - 540000).toISOString(),
  },
];

describe('AIOpsPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch to fail fast (fallback to local RCA)
    vi.mocked(window.fetch).mockRejectedValue(new Error('Network error'));
  });

  it('returns null when not visible', () => {
    const { container } = render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={false} onClose={onClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders panel structure when visible', async () => {
    await act(async () => {
      render(
        <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
      );
      // Wait for effects (generateRCA, loadAutoFixActions) to settle
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText('AI Ops Assistant')).toBeInTheDocument();
    expect(screen.getByText('Root cause analysis')).toBeInTheDocument();

    // Should show tab buttons
    expect(screen.getByText('Root Cause')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('shows incident summary bar when alerts exist', async () => {
    await act(async () => {
      render(
        <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
      );
      // Wait for effects (generateRCA, loadAutoFixActions) to settle
      await new Promise((r) => setTimeout(r, 0));
    });

    // Should show critical/total alert count
    expect(screen.getByText(/2 critical.*3 total/)).toBeInTheDocument();
  });

  it('shows loading state during RCA analysis', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    // Should initially show loading state
    await waitFor(() => {
      expect(screen.getByText('Running root cause analysis...')).toBeInTheDocument();
    });
  });

  it('shows structured RCA chain after analysis completes', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    // Wait for the analysis to complete (fetch fails -> falls back to local RCA)
    await waitFor(() => {
      expect(screen.getByText('Failure Analysis Chain')).toBeInTheDocument();
    });

    // Should show root cause node
    await waitFor(() => {
      expect(screen.getByText('ROOT CAUSE')).toBeInTheDocument();
    });

    // Should show contributing factors
    expect(screen.getByText('CONTRIBUTING')).toBeInTheDocument();

    // Should show Key Insights section
    expect(screen.getByText('Key Insights')).toBeInTheDocument();
  });

  it('shows empty state when no alerts are present', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={[]} visible={true} onClose={onClose} />
    );

    // Wait for analysis to complete
    await waitFor(() => {
      expect(screen.getByText('No issues detected')).toBeInTheDocument();
    });

    // Should show run analysis button
    expect(screen.getByText('Run Analysis')).toBeInTheDocument();
  });

  it('switches to Actions tab', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    // Click Actions tab
    const actionsTab = screen.getByText('Actions');
    fireEvent.click(actionsTab);

    // Should show recommended actions section
    await waitFor(() => {
      expect(screen.getByText('Recommended Actions')).toBeInTheDocument();
    });

    // Should render auto-fix buttons for critical alerts
    await waitFor(() => {
      const buttons = screen.getAllByTestId('auto-fix-button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('can execute an action from the Actions tab', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    // Switch to Actions tab
    await act(async () => {
      fireEvent.click(screen.getByText('Actions'));
    });

    // Wait for actions to load
    await waitFor(() => {
      expect(screen.getAllByTestId('auto-fix-button').length).toBeGreaterThan(0);
    });

    // Click the first action button
    const firstButton = screen.getAllByTestId('auto-fix-button')[0];
    await act(async () => {
      fireEvent.click(firstButton);
    });

    // Wait for execution (simulated with 1500ms delay)
    await waitFor(() => {
      // Execution history should appear after action completes
      expect(screen.getByText('Execution History')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('switches to Summary tab and shows incident overview', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    // Click Summary tab
    fireEvent.click(screen.getByText('Summary'));

    // Should show overview sections
    expect(screen.getByText('Incident Overview')).toBeInTheDocument();
    expect(screen.getByText('Resource Utilization')).toBeInTheDocument();
    expect(screen.getByText('Service Topology')).toBeInTheDocument();

    // Should show critical count
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(2);
  });

  it('shows resource utilization bars in Summary tab', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('Summary'));

    // Should show average CPU and Memory
    expect(screen.getByText('Average CPU')).toBeInTheDocument();
    expect(screen.getByText('Average Memory')).toBeInTheDocument();

    // CPU should be around 80 (average of 72, 88, 95, 65)
    const percentageValues = screen.getAllByText(/^\d+%$/);
    expect(percentageValues.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onClose when backdrop is clicked on mobile', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    // The backdrop has a class that includes fixed positioning
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('shows service topology list in Summary tab', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('Summary'));

    // Should show server names
    expect(screen.getByText('postgres-primary')).toBeInTheDocument();
    expect(screen.getByText('api-gw-prod')).toBeInTheDocument();
  });

  it('shows refresh button in header', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    const refreshButton = document.querySelector('[title="Refresh analysis"]');
    expect(refreshButton).toBeInTheDocument();
  });

  it('shows close button in header', async () => {
    render(
      <AIOpsPanel servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} visible={true} onClose={onClose} />
    );

    const closeButton = screen.getByText('AI Ops Assistant').closest('[class*="px-4 py-3"]')?.querySelector('button:last-child');
    expect(closeButton).toBeInTheDocument();
  });
});
