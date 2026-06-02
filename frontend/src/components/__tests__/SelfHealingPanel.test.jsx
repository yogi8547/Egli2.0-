import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SelfHealingPanel from '../SelfHealingPanel';

// ── Mocks ───────────────────────────────────────────────────────────────

const mockLogs = [
  {
    id: 'l1',
    status: 'success',
    risk: 'low',
    description: 'Restarted monitoring agent on postgres-primary',
    server: 'postgres-primary',
    metric: 'memory_percent',
    action: 'restart-agent',
    output: 'Agent restarted successfully',
    timestamp: '2025-01-01T00:05:00Z',
  },
  {
    id: 'l2',
    status: 'failed',
    risk: 'high',
    description: 'Failed to scale payments-svc',
    server: 'payments-svc',
    metric: 'cpu_percent',
    action: 'scale-up',
    output: 'Error: insufficient resources',
    timestamp: '2025-01-01T00:03:00Z',
  },
  {
    id: 'l3',
    status: 'pending',
    risk: 'medium',
    description: 'Scheduled disk cleanup',
    server: 'api-gw-prod',
    metric: 'disk_percent',
    action: 'disk-cleanup',
    output: null,
    timestamp: '2025-01-01T00:01:00Z',
  },
];

const mockStats = {
  total_actions: 47,
  by_status: { success: 35, failed: 8, pending: 4 },
  active_cooldowns: 2,
  auto_remediate_enabled: false,
};

describe('SelfHealingPanel', () => {
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.spyOn(global, 'fetch');
  });

  function mockApiCalls(stats = mockStats, logs = mockLogs) {
    mockFetch.mockImplementation(async (url) => {
      if (url.includes('/remediation/logs')) {
        return { ok: true, json: async () => ({ logs }) };
      }
      if (url.includes('/remediation/stats')) {
        return { ok: true, json: async () => stats };
      }
      if (url.includes('/remediation/toggle')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: false, json: async () => ({}) };
    });
  }

  // ── Loading State ───────────────────────────────────────────────────

  it('shows loading state on mount', () => {
    // Don't resolve fetch to keep loading
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<SelfHealingPanel />);
    expect(screen.getByText('Loading remediation data...')).toBeInTheDocument();
  });

  // ── Header ──────────────────────────────────────────────────────────

  it('renders the header after loading', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Self-Healing')).toBeInTheDocument();
    });

    expect(screen.getByText(/Automated remediation engine/)).toBeInTheDocument();
  });

  it('shows auto-remediate toggle in OFF state by default', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Auto-Remediate OFF')).toBeInTheDocument();
    });
  });

  // ── Stats Cards ─────────────────────────────────────────────────────

  it('renders stats cards with correct values', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Total Actions')).toBeInTheDocument();
    });

    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders all stat labels', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Total Actions')).toBeInTheDocument();
    });

    expect(screen.getByText('Successful')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Active Cooldowns')).toBeInTheDocument();
  });

  // ── Remediation Log ─────────────────────────────────────────────────

  it('renders remediation log section', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Recent Remediation Actions')).toBeInTheDocument();
    });
  });

  it('renders log entries with descriptions', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Restarted monitoring agent on postgres-primary')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to scale payments-svc')).toBeInTheDocument();
    expect(screen.getByText('Scheduled disk cleanup')).toBeInTheDocument();
  });

  it('shows risk labels on log entries', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('low')).toBeInTheDocument();
    });

    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('shows server names in log entries', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('postgres-primary')).toBeInTheDocument();
    });

    expect(screen.getByText('payments-svc')).toBeInTheDocument();
  });

  it('shows output text for log entries that have it', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Agent restarted successfully')).toBeInTheDocument();
    });

    expect(screen.getByText('Error: insufficient resources')).toBeInTheDocument();
  });

  // ── Empty State ─────────────────────────────────────────────────────

  it('shows empty state when no logs exist', async () => {
    mockApiCalls(mockStats, []);
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('No remediation actions yet')).toBeInTheDocument();
    });

    expect(screen.getByText(/Actions will appear here/)).toBeInTheDocument();
  });

  // ── Toggle ──────────────────────────────────────────────────────────

  it('toggles auto-remediate when button is clicked', async () => {
    mockApiCalls({ ...mockStats, auto_remediate_enabled: false });
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Auto-Remediate OFF')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByText('Auto-Remediate OFF').closest('button');
    fireEvent.click(toggleBtn);

    // After toggle POST succeeds, it should show ON state
    await waitFor(() => {
      expect(screen.getByText('Auto-Remediate ON')).toBeInTheDocument();
    });
  });

  it('shows ON state when auto_remediate_enabled is true', async () => {
    mockApiCalls({ ...mockStats, auto_remediate_enabled: true });
    render(<SelfHealingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Auto-Remediate ON')).toBeInTheDocument();
    });
  });

  // ── Refresh ─────────────────────────────────────────────────────────

  it('has a refresh button', async () => {
    mockApiCalls();
    render(<SelfHealingPanel />);

    await waitFor(() => {
      const refreshBtn = document.querySelector('[class*="p-2 rounded-lg text-gray-400"]');
      expect(refreshBtn).toBeInTheDocument();
    });
  });
});
