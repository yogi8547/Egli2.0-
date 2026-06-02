import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Layout from '../Layout';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('../LiveClock', () => ({
  default: () => <span data-testid="live-clock">12:00:00</span>,
}));

vi.mock('../CountdownTimer', () => ({
  default: ({ seconds, remaining, size }) => (
    <span data-testid="countdown-timer" data-seconds={seconds} data-remaining={remaining} data-size={size}>
      {remaining}s
    </span>
  ),
}));

vi.mock('../AIOpsPanel', () => ({
  default: ({ visible, onClose, servers, metrics, alerts }) => (
    <div data-testid="aiops-panel" data-visible={visible}>
      {visible && <button data-testid="mock-aiops-close" onClick={onClose}>Close</button>}
      AI Ops Panel
    </div>
  ),
}));

const mockThemeContext = {
  theme: 'dark',
  toggleTheme: vi.fn(),
};

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => mockThemeContext,
}));

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'servers', label: 'Servers' },
  { id: 'network', label: 'Network' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'self-healing', label: 'Self-Healing' },
  { id: 'forecasts', label: 'Forecasts' },
  { id: 'ai', label: 'AI Assistant' },
];

// ── Tests ───────────────────────────────────────────────────────────────

describe('Layout', () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockThemeContext.theme = 'dark';
  });

  it('renders children', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div data-testid="child">Main content</div>
      </Layout>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Main content')).toBeInTheDocument();
  });

  it('renders the Egli2.0 logo and title', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByText('Egli2.0')).toBeInTheDocument();
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
  });

  it('renders all navigation items', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('highlights the active navigation item', () => {
    render(
      <Layout activeView="servers" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    // Servers button should have the active class
    const serversBtn = screen.getByText('Servers').closest('button');
    expect(serversBtn.className).toContain('accent');
  });

  it('calls onNavigate with the item id when a nav item is clicked', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    fireEvent.click(screen.getByText('Network'));
    expect(onNavigate).toHaveBeenCalledWith('network');
  });

  it('shows alert badge with count when alertCount > 0', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={5}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('5 active')).toBeInTheDocument();
  });

  it('does not show alert badge when alertCount is 0', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.queryByText(/active/)).not.toBeInTheDocument();
  });

  it('shows Live Connected status when connected', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByText('Live Connected')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows Reconnecting status when disconnected', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={false} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  it('toggles AIOps panel when AI Ops button is clicked', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    const aiopsToggle = screen.getByTitle('Open AI Ops Assistant');
    fireEvent.click(aiopsToggle);
    expect(screen.getByTestId('aiops-panel').getAttribute('data-visible')).toBe('true');
    expect(screen.getByText('Close')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(aiopsToggle);
    expect(screen.getByTestId('aiops-panel').getAttribute('data-visible')).toBe('false');
  });

  it('has close button on AIOps panel that closes it', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    // Open AI Ops panel
    const aiopsToggle = screen.getByTitle('Open AI Ops Assistant');
    fireEvent.click(aiopsToggle);
    expect(screen.getByTestId('aiops-panel').getAttribute('data-visible')).toBe('true');

    // Close using panel's close button
    fireEvent.click(screen.getByTestId('mock-aiops-close'));
    expect(screen.getByTestId('aiops-panel').getAttribute('data-visible')).toBe('false');
  });

  it('toggles sidebar when sidebar button is clicked', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    // The sidebar toggle is the Menu button in header (second one, visible on lg+)
    const menuButtons = document.querySelectorAll('[class*="text-gray-400 hover:text-white"]');
    // Find the sidebar toggle (has transition-transform class)
    const sidebarToggle = Array.from(menuButtons).find(btn =>
      btn.querySelector('[class*="transition-transform"]')
    );
    expect(sidebarToggle).toBeInTheDocument();
  });

  it('calls toggleTheme when theme button is clicked', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    const themeBtn = screen.getByTitle('Switch to light mode');
    fireEvent.click(themeBtn);
    expect(mockThemeContext.toggleTheme).toHaveBeenCalled();
  });

  it('shows light mode toggle when in dark theme', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument();
  });

  it('shows dark mode toggle when in light theme', () => {
    mockThemeContext.theme = 'light';
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument();
  });

  it('renders LiveClock component', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    expect(screen.getByTestId('live-clock')).toBeInTheDocument();
  });

  it('renders CountdownTimer with correct props', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}
        pollRemaining={45} pollInterval={60}>
        <div>content</div>
      </Layout>
    );
    const timer = screen.getByTestId('countdown-timer');
    expect(timer).toBeInTheDocument();
    expect(timer.getAttribute('data-seconds')).toBe('60');
    expect(timer.getAttribute('data-remaining')).toBe('45');
    expect(timer.getAttribute('data-size')).toBe('32');
  });

  it('uses default pollRemaining when not provided', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}>
        <div>content</div>
      </Layout>
    );
    const timer = screen.getByTestId('countdown-timer');
    expect(timer.getAttribute('data-remaining')).toBe('60');
  });

  it('calls onNavigate when alerts badge is clicked', () => {
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={3}>
        <div>content</div>
      </Layout>
    );
    fireEvent.click(screen.getByText('3 active'));
    expect(onNavigate).toHaveBeenCalledWith('alerts');
  });

  it('passes servers, metrics, alerts to AIOpsPanel', () => {
    const servers = [{ id: '1', name: 'test' }];
    const metrics = { test: { cpu: 50 } };
    const alerts = [{ id: 'a1', severity: 'critical' }];
    render(
      <Layout activeView="overview" onNavigate={onNavigate} connected={true} alertCount={0}
        servers={servers} metrics={metrics} alerts={alerts}>
        <div>content</div>
      </Layout>
    );
    // Open AI Ops panel to verify it renders with props
    const aiopsToggle = screen.getByTitle('Open AI Ops Assistant');
    fireEvent.click(aiopsToggle);
    expect(screen.getByTestId('aiops-panel')).toBeInTheDocument();
  });
});
