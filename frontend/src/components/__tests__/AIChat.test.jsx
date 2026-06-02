import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AIChat from '../AIChat';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock ReactMarkdown to render plain text
vi.mock('react-markdown', () => ({
  default: ({ children }) => <div data-testid="markdown">{children}</div>,
}));

// Mock AutoFixButton
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
  { id: 's1', name: 'postgres-primary', host: '10.0.0.1', status: 'online', tags: { type: 'database' } },
  { id: 's2', name: 'api-gw-prod', host: '10.0.0.2', status: 'online', tags: { type: 'gateway' } },
  { id: 's3', name: 'payments-svc', host: '10.0.0.3', status: 'degraded', tags: { type: 'service' } },
];

const mockMetrics = {
  'postgres-primary': { cpu_percent: 72, memory_percent: 91, disk_percent: 45 },
  'api-gw-prod': { cpu_percent: 88, memory_percent: 76, disk_percent: 62 },
  'payments-svc': { cpu_percent: 95, memory_percent: 88, disk_percent: 80 },
};

const mockAlerts = [
  {
    id: 'a1', severity: 'critical', status: 'active', server: 'postgres-primary',
    metric: 'memory_percent', value: 91, threshold: 85,
    message: 'DB connection pool exhausted on postgres-primary',
    created_at: '2025-01-01T00:02:00Z',
  },
  {
    id: 'a2', severity: 'warning', status: 'active', server: 'payments-svc',
    metric: 'cpu_percent', value: 88, threshold: 85,
    message: 'High CPU on payments-svc',
    created_at: '2025-01-01T00:05:00Z',
  },
];

// Helper to create a ReadableStream for mocking streaming responses
function createStreamResponse(chunks) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: {
      getReader() {
        let i = 0;
        return {
          read() {
            if (i >= chunks.length) {
              return Promise.resolve({ done: true, value: undefined });
            }
            const chunk = encoder.encode(`data: ${JSON.stringify({ token: chunks[i] })}\n\n`);
            i++;
            return Promise.resolve({ done: false, value: chunk });
          },
        };
      },
    },
  };
}

describe('AIChat', () => {
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: API streaming fails -> falls back to error response
    mockFetch = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('API not available'));
    // Suppress expected console.error from catch blocks in sendMessage/executeAction
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial State ───────────────────────────────────────────────────

  it('renders the welcome message on mount', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText(/Welcome to AI Infrastructure Assistant/)).toBeInTheDocument();
  });

  it('renders the chat header', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Natural language infrastructure queries')).toBeInTheDocument();
  });

  it('renders the input field', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByPlaceholderText('Ask about your infrastructure...')).toBeInTheDocument();
  });

  it('renders suggested queries sidebar', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Suggested Queries')).toBeInTheDocument();
    expect(screen.getByText(/Summarize overall infrastructure health/)).toBeInTheDocument();
    expect(screen.getByText(/Which servers have high CPU/)).toBeInTheDocument();
  });

  // ── Input & Submit ──────────────────────────────────────────────────

  it('disables submit button when input is empty', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    // Find the submit button (the one with type="submit")
    const form = document.querySelector('form');
    const submitBtn = form.querySelector('button[type="submit"]');
    expect(submitBtn).toBeDisabled();
  });

  it('shows loading indicator while fetching', async () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Type a message
    const input = screen.getByPlaceholderText('Ask about your infrastructure...');
    fireEvent.change(input, { target: { value: 'How are my servers?' } });

    // Submit
    const form = document.querySelector('form');
    fireEvent.submit(form);

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Analyzing infrastructure...')).toBeInTheDocument();
    });
  });

  it('disables input while loading', async () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const input = screen.getByPlaceholderText('Ask about your infrastructure...');
    fireEvent.change(input, { target: { value: 'How are my servers?' } });

    const form = document.querySelector('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(input).toBeDisabled();
    });
  });

  it('sends message and shows user message', async () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const input = screen.getByPlaceholderText('Ask about your infrastructure...');
    fireEvent.change(input, { target: { value: 'How are my servers?' } });

    const form = document.querySelector('form');
    fireEvent.submit(form);

    // User message should appear
    await waitFor(() => {
      expect(screen.getByText('How are my servers?')).toBeInTheDocument();
    });
  });

  // ── Error Handling ──────────────────────────────────────────────────

  it('shows error message with server summary when API fails', async () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const input = screen.getByPlaceholderText('Ask about your infrastructure...');
    fireEvent.change(input, { target: { value: 'What is wrong?' } });

    const form = document.querySelector('form');
    fireEvent.submit(form);

    // Wait for error response
    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument();
    });

    // Should show server summary in error fallback
    await waitFor(() => {
      expect(screen.getByText(/2 online/)).toBeInTheDocument();
      expect(screen.getByText(/1 degraded/)).toBeInTheDocument();
    });
  });

  // ── Streaming Response ──────────────────────────────────────────────

  it('renders streaming tokens as they arrive', async () => {
    mockFetch.mockResolvedValue(createStreamResponse(['The ', 'server ', 'health ', 'is ', 'good.']));

    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const input = screen.getByPlaceholderText('Ask about your infrastructure...');
    fireEvent.change(input, { target: { value: 'Health check?' } });

    const form = document.querySelector('form');
    fireEvent.submit(form);

    // The streaming text should appear (the last token has the cursor marker ▌)
    await waitFor(() => {
      expect(screen.getByText('The server health is good.▌')).toBeInTheDocument();
    });
  });

  it('includes auto-fix actions for RCA queries', async () => {
    mockFetch.mockResolvedValue(createStreamResponse(['Root cause: database connection pool is exhausted.']));

    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const input = screen.getByPlaceholderText('Ask about your infrastructure...');
    fireEvent.change(input, { target: { value: 'Perform root cause analysis of current issues' } });

    const form = document.querySelector('form');
    fireEvent.submit(form);

    // Wait for the full response
    await waitFor(() => {
      expect(screen.getByText('Root cause: database connection pool is exhausted.')).toBeInTheDocument();
    });

    // Auto-fix buttons should appear
    await waitFor(() => {
      const buttons = screen.getAllByTestId('auto-fix-button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  // ── Server Filter ──────────────────────────────────────────────────

  it('renders server filter dropdown when servers exist', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('All Servers')).toBeInTheDocument();
  });

  // ── RCA Mode Toggle ─────────────────────────────────────────────────

  it('toggles to troubleshoot mode', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const toggleBtn = document.querySelector('[title="Show troubleshooting queries"]');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();
    expect(screen.getByText(/Perform root cause analysis/)).toBeInTheDocument();
  });

  it('switches back from troubleshoot to general mode', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Toggle on
    const toggleBtn = document.querySelector('[title="Show troubleshooting queries"]');
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();

    // Toggle off
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Suggested Queries')).toBeInTheDocument();
  });

  // ── Context Sidebar ─────────────────────────────────────────────────

  it('shows context sidebar with server/metric/alert counts', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Context')).toBeInTheDocument();
    // The number 3 appears for both servers count and metrics count
    const threes = screen.getAllByText('3');
    expect(threes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows critical alert info in context sidebar', () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    // Should show critical count badge
    expect(screen.getByText(/1 critical.*needs attention/)).toBeInTheDocument();
    // Should show server name with alert
    // postgres-primary appears both in the dropdown and the context sidebar
    expect(screen.getAllByText('postgres-primary').length).toBeGreaterThanOrEqual(1);
  });

  // ── Refresh Context ─────────────────────────────────────────────────

  it('sends health summary when refresh button is clicked', async () => {
    render(
      <AIChat servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    const refreshBtn = document.querySelector('[title="Refresh context"]');
    fireEvent.click(refreshBtn);

    // Should send the health summary query
    await waitFor(() => {
      expect(screen.getByText('Give me a quick summary of current infrastructure health')).toBeInTheDocument();
    });
  });
});
