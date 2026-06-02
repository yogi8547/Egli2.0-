import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricChart from '../MetricChart';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock Recharts components
vi.mock('recharts', () => ({
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area-element" />,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line-element" />,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar-element" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({ content }) => <div data-testid="tooltip">{content}</div>,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => null,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockData = [
  { time: '2025-01-01T00:00:00Z', value: 45 },
  { time: '2025-01-01T00:01:00Z', value: 52 },
  { time: '2025-01-01T00:02:00Z', value: 48 },
  { time: '2025-01-01T00:03:00Z', value: 61 },
  { time: '2025-01-01T00:04:00Z', value: 55 },
];

describe('MetricChart', () => {
  // ── Empty State ─────────────────────────────────────────────────────

  it('shows no data message when data is empty', () => {
    render(<MetricChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows title in empty state when provided', () => {
    render(<MetricChart data={[]} title="CPU Usage" />);
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('does not show title in empty state when not provided', () => {
    render(<MetricChart data={[]} />);
    expect(screen.queryByText('CPU Usage')).not.toBeInTheDocument();
  });

  // ── Title ────────────────────────────────────────────────────────────

  it('renders the title when provided', () => {
    render(<MetricChart data={mockData} title="Memory Usage" />);
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
  });

  it('does not render a title when not provided', () => {
    render(<MetricChart data={mockData} />);
    expect(screen.queryByText(/Memory|CPU|Disk/)).not.toBeInTheDocument();
  });

  // ── Chart Types ──────────────────────────────────────────────────────

  it('renders area chart by default', () => {
    const { container } = render(<MetricChart data={mockData} />);
    expect(container.querySelector('[data-testid="area-chart"]')).toBeInTheDocument();
  });

  it('renders area chart with type="area"', () => {
    const { container } = render(<MetricChart data={mockData} type="area" />);
    expect(container.querySelector('[data-testid="area-chart"]')).toBeInTheDocument();
  });

  it('renders line chart with type="line"', () => {
    const { container } = render(<MetricChart data={mockData} type="line" />);
    expect(container.querySelector('[data-testid="line-chart"]')).toBeInTheDocument();
  });

  it('renders bar chart with type="bar"', () => {
    const { container } = render(<MetricChart data={mockData} type="bar" />);
    expect(container.querySelector('[data-testid="bar-chart"]')).toBeInTheDocument();
  });

  // ── Metric Types and Colors ─────────────────────────────────────────

  it('shows the metric label in header', () => {
    render(<MetricChart data={mockData} title="CPU Load" metric="cpu" />);
    expect(screen.getByText('CPU Load')).toBeInTheDocument();
    expect(screen.getByText('cpu')).toBeInTheDocument();
  });

  it('shows "memory" metric label', () => {
    render(<MetricChart data={mockData} title="Memory" metric="memory" />);
    expect(screen.getByText('memory')).toBeInTheDocument();
  });

  it('shows "disk" metric label', () => {
    render(<MetricChart data={mockData} title="Disk" metric="disk" />);
    expect(screen.getByText('disk')).toBeInTheDocument();
  });

  it('shows "default" metric label when no metric specified', () => {
    render(<MetricChart data={mockData} title="Usage" />);
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  // ── Custom Tooltip ──────────────────────────────────────────────────

  it('renders CustomTooltip component', () => {
    const { container } = render(<MetricChart data={mockData} />);
    expect(container.querySelector('[data-testid="tooltip"]')).toBeInTheDocument();
  });
});
