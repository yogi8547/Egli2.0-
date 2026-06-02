import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import QuickActionGrid from '../QuickActionGrid';

describe('QuickActionGrid', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Labels & Descriptions ───────────────────────────────────────────

  it('renders all eight quick action buttons with their labels', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    expect(screen.getByText('Run Health Check')).toBeInTheDocument();
    expect(screen.getByText('Active Incidents')).toBeInTheDocument();
    expect(screen.getByText('Auto-Remediate')).toBeInTheDocument();
    expect(screen.getByText('Predictive Analysis')).toBeInTheDocument();
    expect(screen.getByText('Network Scan')).toBeInTheDocument();
    expect(screen.getByText('Backup Now')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Security Audit')).toBeInTheDocument();
  });

  it('renders descriptions for each action', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    expect(screen.getByText('Instant system-wide diagnostics')).toBeInTheDocument();
    expect(screen.getByText('View unresolved alerts & issues')).toBeInTheDocument();
    expect(screen.getByText('Apply AI-driven fixes to issues')).toBeInTheDocument();
    expect(screen.getByText('AI-powered capacity forecasts')).toBeInTheDocument();
    expect(screen.getByText('Map live topology & connections')).toBeInTheDocument();
    expect(screen.getByText('Trigger config backup across servers')).toBeInTheDocument();
    expect(screen.getByText('Review recent changes & events')).toBeInTheDocument();
    expect(screen.getByText('Check firewall & access policies')).toBeInTheDocument();
  });

  // ─── Interaction: calling onAction ──────────────────────────────────

  it('calls onAction with "network" when Network Scan is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Network Scan'));

    act(() => { vi.advanceTimersByTime(400); });

    expect(onAction).toHaveBeenCalledWith('network');
  });

  it('calls onAction with "servers" when Backup Now is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Backup Now'));

    act(() => { vi.advanceTimersByTime(400); });

    expect(onAction).toHaveBeenCalledWith('servers');
  });

  it('calls onAction with "ai" when Audit Logs is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Audit Logs'));

    act(() => { vi.advanceTimersByTime(400); });

    expect(onAction).toHaveBeenCalledWith('ai');
  });

  it('calls onAction with "alerts" when Security Audit is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Security Audit'));

    act(() => { vi.advanceTimersByTime(400); });

    expect(onAction).toHaveBeenCalledWith('alerts');
  });

  it('calls onAction with "diagnose" when Run Health Check is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Run Health Check'));

    // The action fires after 400ms timeout
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onAction).toHaveBeenCalledWith('diagnose');
  });

  it('calls onAction with "alerts" when Active Incidents is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Active Incidents'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onAction).toHaveBeenCalledWith('alerts');
  });

  it('calls onAction with "self-healing" when Auto-Remediate is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Auto-Remediate'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onAction).toHaveBeenCalledWith('self-healing');
  });

  it('calls onAction with "forecasts" when Predictive Analysis is clicked', () => {
    const onAction = vi.fn();
    render(<QuickActionGrid onAction={onAction} />);

    fireEvent.click(screen.getByText('Predictive Analysis'));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onAction).toHaveBeenCalledWith('forecasts');
  });

  // ── Executing / Disabled State ──────────────────────────────────────

  it('shows a loading spinner on the clicked button while executing', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    // Click Run Health Check
    fireEvent.click(screen.getByText('Run Health Check'));

    // The button should now show a spinner instead of the search icon
    // Loader2 has class "animate-spin"
    const healthCheckBtn = screen.getByText('Run Health Check').closest('button');
    const spinner = healthCheckBtn.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('disables the clicked button while executing', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    fireEvent.click(screen.getByText('Run Health Check'));

    const btn = screen.getByText('Run Health Check').closest('button');
    expect(btn).toBeDisabled();
  });

  it('only disables the clicked button, not the other buttons', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    fireEvent.click(screen.getByText('Run Health Check'));

    const healthCheckBtn = screen.getByText('Run Health Check').closest('button');
    expect(healthCheckBtn).toBeDisabled();

    const alertsBtn = screen.getByText('Active Incidents').closest('button');
    expect(alertsBtn).not.toBeDisabled();
  });

  it('re-enables the button and removes spinner after execution completes', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    fireEvent.click(screen.getByText('Run Health Check'));

    // Button should be disabled with spinner
    const btn = screen.getByText('Run Health Check').closest('button');
    expect(btn).toBeDisabled();

    // Advance timers past the 400ms timeout
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Button should now be enabled
    expect(btn).not.toBeDisabled();
    const spinner = btn.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  // ── Graceful fallback ───────────────────────────────────────────────

  it('does not throw error when onAction is not provided', () => {
    expect(() => render(<QuickActionGrid />)).not.toThrow();
  });

  it('handles click gracefully when onAction is not provided', () => {
    render(<QuickActionGrid />);

    // Should not error even without onAction callback
    expect(() => {
      fireEvent.click(screen.getByText('Run Health Check'));
      act(() => {
        vi.advanceTimersByTime(400);
      });
    }).not.toThrow();
  });

  // ── Grid Structure ──────────────────────────────────────────────────

  it('renders the correct grid layout classes', () => {
    const { container } = render(<QuickActionGrid onAction={vi.fn()} />);

    const gridDiv = container.firstChild;
    expect(gridDiv.className).toContain('grid-cols-2');
    expect(gridDiv.className).toContain('sm:grid-cols-4');
    expect(gridDiv.className).toContain('gap-3');
  });

  it('renders exactly eight action buttons', () => {
    render(<QuickActionGrid onAction={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(8);
  });

  // ── Visual elements ─────────────────────────────────────────────────

  it('renders animated arrow indicators on each card', () => {
    const { container } = render(<QuickActionGrid onAction={vi.fn()} />);

    // Each card should have an ArrowRight icon
    const arrows = container.querySelectorAll('.lucide-arrow-right');
    expect(arrows).toHaveLength(8);
  });
});
