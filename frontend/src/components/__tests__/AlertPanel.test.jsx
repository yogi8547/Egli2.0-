import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AlertPanel from '../AlertPanel';

// ── Fixtures ─────────────────────────────────────────────────────────────

const baseAlert = {
  id: 'alert-1',
  severity: 'critical',
  status: 'active',
  server: 'postgres-primary',
  metric: 'memory_percent',
  value: 91,
  threshold: 85,
  message: 'DB connection pool exhausted: postgres-primary memory at 91%',
  created_at: new Date('2026-01-15T10:30:00').toISOString(),
};

const criticalAlert = { ...baseAlert };

const warningAlert = {
  ...baseAlert,
  id: 'alert-2',
  severity: 'warning',
  server: 'api-gw-prod',
  metric: 'cpu_percent',
  value: 88,
  message: 'API gateway 504s rising: api-gw-prod CPU at 88%',
  created_at: new Date('2026-01-15T10:15:00').toISOString(),
};

const infoAlert = {
  ...baseAlert,
  id: 'alert-3',
  severity: 'info',
  status: 'acknowledged',
  server: 'cache-svc',
  metric: 'disk_percent',
  value: 72,
  threshold: 90,
  message: 'Cache node disk usage rising',
  created_at: new Date('2026-01-15T09:45:00').toISOString(),
};

const resolvedAlert = {
  ...baseAlert,
  id: 'alert-4',
  severity: 'warning',
  status: 'resolved',
  server: 'worker-svc',
  metric: 'queue_depth',
  value: 12,
  threshold: 50,
  message: 'Job queue depth normalized',
  created_at: new Date('2026-01-15T08:00:00').toISOString(),
};

const mockAlerts = [criticalAlert, warningAlert];

const mockActions = {
  actions: [
    {
      action: 'restart_service',
      description: 'Restart postgres-primary service',
      command: 'systemctl restart postgres-primary',
      risk: 'high',
    },
    {
      action: 'scale_up',
      description: 'Scale up memory limit by 20%',
      command: 'kubectl scale deployment postgres-primary --replicas=3',
      risk: 'medium',
    },
    {
      action: 'clear_cache',
      description: 'Clear shared memory cache',
      command: 'echo 3 > /proc/sys/vm/drop_caches',
      risk: 'low',
    },
  ],
};

const mockHistory = {
  logs: [
    {
      id: 'log-1',
      action: 'restart_service',
      description: 'Restart postgres-primary service',
      status: 'success',
      risk: 'high',
      server: 'postgres-primary',
      metric: 'memory_percent',
      timestamp: new Date('2026-01-14T22:00:00').toISOString(),
      output: 'Service restarted successfully. Memory usage dropped to 65%.',
    },
    {
      id: 'log-2',
      action: 'scale_up',
      description: 'Scale up memory limit',
      status: 'failed',
      risk: 'medium',
      server: 'postgres-primary',
      metric: 'memory_percent',
      timestamp: new Date('2026-01-14T21:30:00').toISOString(),
      output: 'Error: insufficient cluster resources.',
    },
    {
      id: 'log-3',
      action: 'clear_cache',
      description: 'Clear shared memory cache',
      status: 'pending',
      risk: 'low',
      server: 'postgres-primary',
      metric: 'memory_percent',
      timestamp: new Date('2026-01-14T21:00:00').toISOString(),
      output: 'Simulated execution: no changes made.',
    },
  ],
};

const mockRemediation = {
  remediation: 'Root cause: Memory leak in connection pool. Suggestion: Increase max_connections and restart service.',
};

describe('AlertPanel', () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default fetch mock: handle common endpoints to avoid console.error noise
    vi.mocked(window.fetch).mockImplementation((url) => {
      if (url.includes('/remediation-actions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ actions: [] }) });
      }
      if (url.includes('/remediation/logs')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ logs: [] }) });
      }
      return Promise.reject(new Error('Unmocked fetch'));
    });
  });

  // ── Basic Rendering ─────────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders the header with title and counts', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByText('2 active · 1 critical')).toBeInTheDocument();
    });

    it('renders alert count correctly when no active alerts', () => {
      render(<AlertPanel alerts={[resolvedAlert]} onRefresh={onRefresh} />);

      expect(screen.getByText('0 active · 0 critical')).toBeInTheDocument();
    });

    it('shows empty state when no alerts', () => {
      render(<AlertPanel alerts={[]} onRefresh={onRefresh} />);

      expect(screen.getByText('No alerts to display')).toBeInTheDocument();
      expect(screen.getByText('All systems operating normally')).toBeInTheDocument();
    });

    it('renders each alert with severity badge, status badge, server, and message', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      // Severity badges
      expect(screen.getByText('critical')).toBeInTheDocument();
      expect(screen.getByText('warning')).toBeInTheDocument();

      // Status badges
      const activeBadges = screen.getAllByText('active');
      expect(activeBadges.length).toBeGreaterThanOrEqual(2);

      // Server names
      expect(screen.getByText('postgres-primary')).toBeInTheDocument();
      expect(screen.getByText('api-gw-prod')).toBeInTheDocument();

      // Messages
      expect(screen.getByText(/DB connection pool exhausted/)).toBeInTheDocument();
      expect(screen.getByText(/API gateway 504s rising/)).toBeInTheDocument();
    });

    it('renders metric info for each alert', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      // Metric text is split across multiple text nodes, use function matcher
      const metricEls = screen.getAllByText((content) =>
        content.includes('Metric:') && content.includes('memory_percent')
      );
      expect(metricEls.length).toBeGreaterThanOrEqual(1);

      const cpuEls = screen.getAllByText((content) =>
        content.includes('Metric:') && content.includes('cpu_percent')
      );
      expect(cpuEls.length).toBeGreaterThanOrEqual(1);

      expect(screen.getByText(/Value: 91\.0/)).toBeInTheDocument();
      expect(screen.getByText(/Value: 88\.0/)).toBeInTheDocument();

      // Both alerts have threshold 85, so use getAllByText
      const thresholdEls = screen.getAllByText(/Threshold: 85/);
      expect(thresholdEls.length).toBe(2);
    });
  });

  // ── Filtering ───────────────────────────────────────────────────────

  describe('filtering', () => {
    it('shows filter buttons: All, Active, Critical', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('shows all alerts by default', () => {
      render(<AlertPanel alerts={[...mockAlerts, infoAlert]} onRefresh={onRefresh} />);

      expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('acknowledged')).toBeInTheDocument();
    });

    it('filters to active only when Active filter is clicked', () => {
      render(<AlertPanel alerts={[...mockAlerts, resolvedAlert]} onRefresh={onRefresh} />);

      // Before clicking Active filter, all 3 alerts are visible
      expect(screen.getByText('resolved')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Active'));

      // After clicking Active filter, only active alerts remain, resolved should be gone
      expect(screen.queryByText('resolved')).not.toBeInTheDocument();
    });

    it('filters to critical only when Critical filter is clicked', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByText('Critical'));

      // Only the critical alert should remain
      expect(screen.getByText(/DB connection pool exhausted/)).toBeInTheDocument();
      expect(screen.queryByText('API gateway 504s rising')).not.toBeInTheDocument();
    });

    it('shows appropriate empty message when filter results in no alerts', () => {
      render(<AlertPanel alerts={[infoAlert]} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByText('Critical'));

      // No critical alerts — should still show the empty state since filteredAlerts is empty
      expect(screen.getByText('No alerts to display')).toBeInTheDocument();
    });
  });

  // ── Acknowledgement & Resolution ────────────────────────────────────

  describe('acknowledge and resolve', () => {
    it('shows acknowledge and resolve buttons for active alerts', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const acknowledgeButtons = document.querySelectorAll('[title="Acknowledge"]');
      const resolveButtons = document.querySelectorAll('[title="Resolve"]');

      // Both alerts are active, so both should have buttons
      expect(acknowledgeButtons.length).toBe(2);
      expect(resolveButtons.length).toBe(2);
    });

    it('does NOT show acknowledge/resolve buttons for resolved alerts', () => {
      render(<AlertPanel alerts={[resolvedAlert]} onRefresh={onRefresh} />);

      expect(document.querySelector('[title="Acknowledge"]')).not.toBeInTheDocument();
      expect(document.querySelector('[title="Resolve"]')).not.toBeInTheDocument();
    });

    it('calls fetch and onRefresh when acknowledge is clicked', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.mocked(window.fetch).mockImplementation(mockFetch);

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const acknowledgeBtns = document.querySelectorAll('[title="Acknowledge"]');
      await act(async () => {
        fireEvent.click(acknowledgeBtns[0]);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/alerts/alert-1/acknowledge',
        expect.objectContaining({ method: 'POST' })
      );
      expect(onRefresh).toHaveBeenCalled();
    });

    it('calls fetch and onRefresh when resolve is clicked', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.mocked(window.fetch).mockImplementation(mockFetch);

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const resolveBtns = document.querySelectorAll('[title="Resolve"]');
      await act(async () => {
        fireEvent.click(resolveBtns[0]);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/alerts/alert-1/resolve',
        expect.objectContaining({ method: 'POST' })
      );
      expect(onRefresh).toHaveBeenCalled();
    });

    it('does not crash if acknowledge fetch fails', async () => {
      vi.mocked(window.fetch).mockRejectedValue(new Error('Network error'));
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const acknowledgeBtns = document.querySelectorAll('[title="Acknowledge"]');
      await act(async () => {
        fireEvent.click(acknowledgeBtns[0]);
      });

      // Should not crash — onRefresh is still called (it's inside try, wait... no it's inside the try block)
      // Actually looking at the code: onRefresh is inside the try block.
      // If fetch fails, onRefresh won't be called
      expect(onRefresh).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ── Expand / Collapse ──────────────────────────────────────────────

  describe('expand and collapse', () => {
    it('expands an alert when chevron is clicked', async () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      // Expand the first alert
      const expandBtn = document.querySelector('[title=""]'); // No title on chevron button
      // Actually the chevron button has no title, let's use the chevron icon parent
      const chevronDown = document.querySelector('.lucide-chevron-down');
      expect(chevronDown).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Expanded sections should appear
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      expect(screen.getByText('AI Deep Analysis')).toBeInTheDocument();
      expect(screen.getByText('Remediation History')).toBeInTheDocument();
    });

    it('collapses an alert when chevron is clicked again', async () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      // Expand
      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Verify expanded
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();

      // Collapse
      const chevronUp = document.querySelector('.lucide-chevron-up');
      await act(async () => {
        fireEvent.click(chevronUp.closest('button'));
      });

      // Expanded sections should be gone
      expect(screen.queryByText('Quick Actions')).not.toBeInTheDocument();
    });

    it('shows alert details section when expanded', async () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Alert details should be visible
      expect(screen.getByText('Alert ID')).toBeInTheDocument();
      expect(screen.getByText('alert-1')).toBeInTheDocument();
      expect(screen.getByText('Metric')).toBeInTheDocument();
      expect(screen.getByText('memory_percent')).toBeInTheDocument();
      expect(screen.getByText('Current Value')).toBeInTheDocument();
      // value.toFixed(2) for 91 => "91.00"
      expect(screen.getByText('91.00')).toBeInTheDocument();
      expect(screen.getByText('Threshold')).toBeInTheDocument();
    });
  });

  // ── Quick Actions ───────────────────────────────────────────────────

  describe('quick actions', () => {
    it('shows loading state while fetching actions', async () => {
      // Don't resolve the fetch — keep it pending
      vi.mocked(window.fetch).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Loading actions...')).toBeInTheDocument();
      });
    });

    it('renders predefined actions after fetch', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Wait for actions to load
      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });

      expect(screen.getByText('Scale up memory limit by 20%')).toBeInTheDocument();
      expect(screen.getByText('Clear shared memory cache')).toBeInTheDocument();

      // Risk badges
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
      expect(screen.getByText('low')).toBeInTheDocument();

      // Commands
      expect(screen.getByText('systemctl restart postgres-primary')).toBeInTheDocument();
    });

    it('shows fallback message when no predefined actions', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('No predefined actions available for this metric type.')).toBeInTheDocument();
      });
    });

    it('filters actions by search query', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Wait for actions to load
      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });

      // Type in search
      const searchInput = screen.getByPlaceholderText('Filter actions...');
      fireEvent.change(searchInput, { target: { value: 'cache' } });

      // Only cache-related action should be visible
      expect(screen.getByText('Clear shared memory cache')).toBeInTheDocument();
      expect(screen.queryByText('Restart postgres-primary service')).not.toBeInTheDocument();

      // Clear search by changing input to empty
      fireEvent.change(searchInput, { target: { value: '' } });

      // All actions should reappear
      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });
    });

    it('shows no-match message when search has no results', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Filter actions...');
      fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

      expect(screen.getByText(/No actions match/)).toBeInTheDocument();
    });

    it('executes low-risk action directly on click', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        if (url.includes('/execute-action')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: { status: 'success', action: 'clear_cache', output: 'Cache cleared successfully.' },
            }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });
      vi.mocked(window.fetch).mockImplementation(mockFetch);

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Wait for actions to load
      await waitFor(() => {
        expect(screen.getByText('Clear shared memory cache')).toBeInTheDocument();
      });

      // Find and click the execute button for the low-risk action
      // The execute button is the one with Terminal icon
      const executeButtons = document.querySelectorAll('[title="Execute action"]');
      expect(executeButtons.length).toBeGreaterThanOrEqual(1);

      await act(async () => {
        fireEvent.click(executeButtons[0]);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/execute-action'),
          expect.objectContaining({ method: 'POST' })
        );
      });

      // Should call onRefresh after execution
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  // ── High-Risk Confirmation ──────────────────────────────────────────

  describe('high-risk confirmation', () => {
    it('shows confirmation dialog when clicking a high-risk action', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });

      // High-risk action has title "Click to confirm execution"
      const highRiskBtn = document.querySelector('[title="Click to confirm execution"]');
      await act(async () => {
        fireEvent.click(highRiskBtn);
      });

      // Confirmation dialog should appear
      expect(screen.getByText('Confirm High-Risk Action')).toBeInTheDocument();
      expect(screen.getByText('Yes, Execute')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('executes action when confirming high-risk action', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/execute-action')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              result: { status: 'success', action: 'restart_service', output: 'Service restarted.' },
            }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });
      vi.mocked(window.fetch).mockImplementation(mockFetch);

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });

      // Click the high-risk action button to open confirmation
      const highRiskBtn = document.querySelector('[title="Click to confirm execution"]');
      await act(async () => {
        fireEvent.click(highRiskBtn);
      });

      // Click "Yes, Execute" to confirm
      await act(async () => {
        fireEvent.click(screen.getByText('Yes, Execute'));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/execute-action'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('dismisses confirmation dialog when Cancel is clicked', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockActions),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
      });

      // Open confirmation
      const highRiskBtn = document.querySelector('[title="Click to confirm execution"]');
      await act(async () => {
        fireEvent.click(highRiskBtn);
      });

      expect(screen.getByText('Confirm High-Risk Action')).toBeInTheDocument();

      // Cancel
      await act(async () => {
        fireEvent.click(screen.getByText('Cancel'));
      });

      // Confirmation should be dismissed
      expect(screen.queryByText('Confirm High-Risk Action')).not.toBeInTheDocument();
    });
  });

  // ── AI Deep Analysis ───────────────────────────────────────────────

  describe('AI deep analysis', () => {
    it('triggers deep analysis when Deep Analysis button is clicked', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediate?deep=true')) {
          // Don't resolve to keep the loading state visible
          return new Promise(() => {});
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });
      vi.mocked(window.fetch).mockImplementation(mockFetch);

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Wait for expand to settle
      await waitFor(() => {
        expect(screen.getByText('AI Deep Analysis')).toBeInTheDocument();
      });

      // Click the Deep Analysis button
      const deepAnalysisBtn = screen.getByText('Deep Analysis');
      await act(async () => {
        fireEvent.click(deepAnalysisBtn);
      });

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Analyzing with AI...')).toBeInTheDocument();
      });
    });

    it('shows remediation result after deep analysis completes', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediate?deep=true')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockRemediation),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });
      vi.mocked(window.fetch).mockImplementation(mockFetch);

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('AI Deep Analysis')).toBeInTheDocument();
      });

      // Click Deep Analysis
      await act(async () => {
        fireEvent.click(screen.getByText('Deep Analysis'));
      });

      // Wait for remediation text to appear
      await waitFor(() => {
        expect(screen.getByText(/Memory leak in connection pool/)).toBeInTheDocument();
      });
    });

    it('shows fallback text before analysis is triggered', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Need more detail\? Click "Deep Analysis"/)
        ).toBeInTheDocument();
      });
    });
  });

  // ── Remediation History ────────────────────────────────────────────

  describe('remediation history', () => {
    it('fetches and displays remediation history on expand', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockHistory),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      // Wait for history entries to appear
      await waitFor(() => {
        expect(screen.getByText('Remediation History')).toBeInTheDocument();
      });

      // History entries should be rendered
      await waitFor(() => {
        expect(screen.getByText('Restart postgres-primary service')).toBeInTheDocument();
        expect(screen.getByText('Scale up memory limit')).toBeInTheDocument();
        expect(screen.getByText('Clear shared memory cache')).toBeInTheDocument();
      });

      // Status badges
      expect(screen.getByText('success')).toBeInTheDocument();
      expect(screen.getByText('failed')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('shows history filter buttons when history exists', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockHistory),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Remediation History')).toBeInTheDocument();
      });

      // Filter buttons should appear
      // 'All' appears in both main filter and history filter, so use getAllByText
      const allBtns = screen.getAllByText('All');
      expect(allBtns.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Skipped')).toBeInTheDocument();
    });

    it('filters history by status when filter is clicked', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve(mockHistory),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(screen.getByText('Remediation History')).toBeInTheDocument();
      });

      // All 3 entries visible
      expect(screen.getByText('Clear shared memory cache')).toBeInTheDocument();

      // Click "Failed" filter
      const failedFilterBtns = screen.getAllByText('Failed');
      // There might be a severity badge too with 'failed', so use the filter button
      // Actually in history filter, 'Failed' is the button text
      // But there's also a status badge with 'failed' text
      // Let's click the first one that's in the filter area
      const failedFilter = failedFilterBtns.find((btn) => btn.tagName === 'BUTTON');
      if (failedFilter) {
        await act(async () => {
          fireEvent.click(failedFilter);
        });
      }

      // Only the failed entry should be visible
      expect(screen.getByText('Scale up memory limit')).toBeInTheDocument();
      // The success entry should not be in history (but there's also a success badge in history)
      // Actually the success entry has text "Restart postgres-primary service" which is also the action description
      // Wait, "Scale up memory limit" is the description of the failed entry
      // Let me check - the mock history has:
      // log-1: description 'Restart postgres-primary service', status 'success'
      // log-2: description 'Scale up memory limit', status 'failed'  
      // log-3: description 'Clear shared memory cache', status 'pending'
      // After filtering to 'failed', only log-2 should remain
      // So "Restart postgres-primary service" should NOT be visible
      expect(screen.queryByText('Restart postgres-primary service')).not.toBeInTheDocument();
    });

    it('shows no-history message when history is empty', async () => {
      vi.mocked(window.fetch).mockImplementation((url) => {
        if (url.includes('/remediation-actions')) {
          return Promise.resolve({
            json: () => Promise.resolve({ actions: [] }),
          });
        }
        if (url.includes('/remediation/logs')) {
          return Promise.resolve({
            json: () => Promise.resolve({ logs: [] }),
          });
        }
        return Promise.reject(new Error('Unmocked fetch'));
      });

      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      const chevronDown = document.querySelector('.lucide-chevron-down');
      await act(async () => {
        fireEvent.click(chevronDown.closest('button'));
      });

      await waitFor(() => {
        expect(
          screen.getByText('No remediation history for this alert.')
        ).toBeInTheDocument();
      });
    });
  });

  // ── Refresh ────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('calls onRefresh when refresh button is clicked', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      // Refresh button is the one with RefreshCw icon
      const refreshBtn = document.querySelector('.lucide-refresh-cw');
      expect(refreshBtn).toBeInTheDocument();

      fireEvent.click(refreshBtn.closest('button'));
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles unknown severity gracefully', () => {
      const unknownAlert = {
        ...baseAlert,
        id: 'alert-unknown',
        severity: 'unknown',
      };

      render(<AlertPanel alerts={[unknownAlert]} onRefresh={onRefresh} />);

      // Should render with warning-style fallback
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });

    it('handles alerts without values gracefully', () => {
      const noValueAlert = {
        ...baseAlert,
        id: 'alert-noval',
        value: undefined,
        threshold: undefined,
      };

      render(<AlertPanel alerts={[noValueAlert]} onRefresh={onRefresh} />);

      // Should render without crashing
      // Metric text is split across spans, use function matcher
      const metricEls = screen.getAllByText((content) =>
        content.includes('Metric:') && content.includes('memory_percent')
      );
      expect(metricEls.length).toBeGreaterThanOrEqual(1);
    });

    it('renders each alert with a timestamp', () => {
      render(<AlertPanel alerts={mockAlerts} onRefresh={onRefresh} />);

      // Both timestamps should be rendered as locale strings
      // toLocaleString is locale-dependent, so check for the year which is always present
      const timeEls = screen.getAllByText(/2026/);
      expect(timeEls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
