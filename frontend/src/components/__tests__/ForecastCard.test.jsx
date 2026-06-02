import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ForecastCard from '../ForecastCard';

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockForecasts = [
  {
    metric: 'cpu_percent',
    trend: 'increasing',
    current_value: 72,
    slope_per_hour: 0.045,
    confidence: 'high',
    days_to_warning: 3,
    days_to_critical: 7,
    predicted_7d: 81.5,
    predicted_30d: 95.2,
  },
  {
    metric: 'memory_percent',
    trend: 'increasing',
    current_value: 91,
    slope_per_hour: 0.032,
    confidence: 'medium',
    days_to_warning: 1,
    days_to_critical: null,
    predicted_7d: 95.8,
    predicted_30d: null,
  },
  {
    metric: 'disk_percent',
    trend: 'decreasing',
    current_value: 45,
    slope_per_hour: -0.021,
    confidence: 'low',
    days_to_warning: null,
    days_to_critical: null,
    predicted_7d: null,
    predicted_30d: null,
  },
];

// Forecast with 'flat' trend (not decreasing/stable) to test insufficient data message
const mockForecastFlat = {
  metric: 'network_io',
  trend: 'flat',
  current_value: 30,
  slope_per_hour: 0.005,
  confidence: 'low',
  days_to_warning: null,
  days_to_critical: null,
  predicted_7d: null,
  predicted_30d: null,
};

const mockForecastStable = {
  metric: 'memory_percent',
  trend: 'stable',
  current_value: 55,
  slope_per_hour: 0.001,
  confidence: 'high',
  days_to_warning: null,
  days_to_critical: null,
  predicted_7d: 55.2,
  predicted_30d: 55.5,
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('ForecastCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty State ─────────────────────────────────────────────────────

  it('shows empty state when forecasts is null', () => {
    render(<ForecastCard server="test-srv" forecasts={null} />);
    expect(screen.getByText('No forecast data yet')).toBeInTheDocument();
    expect(screen.getByText(/Data will be available/)).toBeInTheDocument();
  });

  it('shows empty state when forecasts is empty array', () => {
    render(<ForecastCard server="test-srv" forecasts={[]} />);
    expect(screen.getByText('No forecast data yet')).toBeInTheDocument();
  });

  it('shows calendar icon in empty state', () => {
    const { container } = render(<ForecastCard server="test-srv" forecasts={[]} />);
    // Calendar icon from lucide should render (any SVG with calendar-ish class)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ── Normal Rendering ────────────────────────────────────────────────

  it('renders the forecast container with server name', () => {
    render(<ForecastCard server="db-primary" forecasts={mockForecasts} />);
    expect(screen.getByText(/Predictive Forecasts/)).toBeInTheDocument();
    expect(screen.getByText(/db-primary/)).toBeInTheDocument();
  });

  it('renders forecast metrics for each forecast', () => {
    render(<ForecastCard server="test-srv" forecasts={mockForecasts} />);
    // Uses metricLabels mapping
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Disk')).toBeInTheDocument();
  });

  it('shows metric name as-is when not in metricLabels map', () => {
    const customForecast = [{
      metric: 'custom_metric',
      trend: 'stable',
      current_value: 50,
      slope_per_hour: 0,
      confidence: 'high',
      days_to_warning: null,
      days_to_critical: null,
    }];
    render(<ForecastCard server="test-srv" forecasts={customForecast} />);
    expect(screen.getByText('custom_metric')).toBeInTheDocument();
  });

  // ── Trend Icons ──────────────────────────────────────────────────────

  it('shows increasing trend icon for increasing forecasts', () => {
    const { container } = render(<ForecastCard server="test-srv" forecasts={[mockForecasts[0]]} />);
    const svgs = container.querySelectorAll('svg');
    // Should render at least the TrendIcon SVG (TrendingUp)
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('shows decreasing trend message for decreasing forecasts', () => {
    // disk_percent has decreasing trend with null days_to_warning
    render(<ForecastCard server="test-srv" forecasts={mockForecasts} />);
    // Also shows the "no threshold breach" message
    expect(screen.getByText(/Trending downward/)).toBeInTheDocument();
  });

  it('shows stable trend message for stable forecasts when no projection', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecastStable]} />);
    expect(screen.getByText(/Stable/)).toBeInTheDocument();
  });

  // ── Confidence Badges ───────────────────────────────────────────────

  it('shows high confidence badge', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecasts[0]]} />);
    expect(screen.getByText('high confidence')).toBeInTheDocument();
  });

  it('shows medium confidence badge', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecasts[1]]} />);
    expect(screen.getByText('medium confidence')).toBeInTheDocument();
  });

  it('shows low confidence badge', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecasts[2]]} />);
    expect(screen.getByText('low confidence')).toBeInTheDocument();
  });

  // ── Current Values ──────────────────────────────────────────────────

  it('shows current values for each metric', () => {
    render(<ForecastCard server="test-srv" forecasts={mockForecasts} />);
    // Current values with %
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('shows slope per hour', () => {
    render(<ForecastCard server="test-srv" forecasts={mockForecasts} />);
    expect(screen.getByText('+0.045%/hr')).toBeInTheDocument();
    expect(screen.getByText('+0.032%/hr')).toBeInTheDocument();
    expect(screen.getByText('-0.021%/hr')).toBeInTheDocument();
  });

  // ── Projections ─────────────────────────────────────────────────────

  it('shows warning-in projection when days_to_warning is < 1', () => {
    const nearTerm = { ...mockForecasts[1], days_to_warning: 0.7 };
    render(<ForecastCard server="test-srv" forecasts={[nearTerm]} />);
    expect(screen.getByText('Warning in')).toBeInTheDocument();
    expect(screen.getByText('<1 day')).toBeInTheDocument();
  });

  it('shows critical-in projection when days_to_critical is set', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecasts[0]]} />);
    expect(screen.getByText('Critical in')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  it('shows days_to_warning >= 1 as rounded up days', () => {
    render(<ForecastCard server="test-srv" forecasts={[{
      ...mockForecasts[0],
      days_to_warning: 3.4,
      days_to_critical: 8.9,
    }]} />);
    // Math.ceil(3.4) = 4, Math.ceil(8.9) = 9 but rendered as "4 days"
    expect(screen.getByText('4 days')).toBeInTheDocument();
    expect(screen.getByText('9 days')).toBeInTheDocument();
  });

  it('shows insufficient data message when both projections are null and trend is not decreasing/stable', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecastFlat]} />);
    expect(screen.getByText(/Insufficient data/)).toBeInTheDocument();
  });

  // ── Predicted Values ────────────────────────────────────────────────

  it('shows 7d predicted value when available', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecasts[0]]} />);
    expect(screen.getByText('81.5%')).toBeInTheDocument();
  });

  it('shows 30d predicted value when available', () => {
    render(<ForecastCard server="test-srv" forecasts={[mockForecasts[0]]} />);
    expect(screen.getByText('95.2%')).toBeInTheDocument();
  });

  // ── Critical Callout ────────────────────────────────────────────────

  it('shows critical threshold callout when any forecast has days_to_critical', () => {
    render(<ForecastCard server="test-srv" forecasts={mockForecasts} />);
    expect(screen.getByText(/Critical threshold projections detected/)).toBeInTheDocument();
  });

  it('does not show critical callout when no forecasts have days_to_critical', () => {
    const safeForecasts = mockForecasts.map(f => ({ ...f, days_to_critical: null }));
    render(<ForecastCard server="test-srv" forecasts={safeForecasts} />);
    expect(screen.queryByText(/Critical threshold/)).not.toBeInTheDocument();
  });
});
