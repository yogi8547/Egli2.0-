import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import LiveClock from '../LiveClock';

// ── Tests ───────────────────────────────────────────────────────────────

describe('LiveClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze Date to a known time
    vi.setSystemTime(new Date('2026-01-15T14:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders current time using toLocaleTimeString', () => {
    render(<LiveClock />);
    // The time should be rendered (actual format depends on locale)
    const timeEl = screen.getByText(/2:30:00/);
    expect(timeEl).toBeInTheDocument();
  });

  it('uses mono font class for the time display', () => {
    render(<LiveClock />);
    const timeEl = screen.getByText(/2:30:00/);
    expect(timeEl.className).toContain('font-mono');
    expect(timeEl.className).toContain('tabular-nums');
  });

  it('renders a ticking dot indicator', () => {
    const { container } = render(<LiveClock />);
    // The dot is an inline span after the time
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('bg-success');
  });

  it('updates time display after 1 second', () => {
    render(<LiveClock />);
    expect(screen.getByText(/2:30:00/)).toBeInTheDocument();

    // Advance time by 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/2:30:01/)).toBeInTheDocument();
  });

  it('updates time display after multiple seconds', () => {
    render(<LiveClock />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText(/2:30:05/)).toBeInTheDocument();
  });

  it('clears the interval on unmount', () => {
    const { unmount } = render(<LiveClock />);
    const clearSpy = vi.spyOn(global, 'clearInterval');

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('sets ticking state to true on mount', () => {
    const { container } = render(<LiveClock />);
    // The dot should have the bg-success class (ticking=true)
    const dot = container.querySelector('.rounded-full');
    expect(dot.className).toContain('bg-success');
  });
});
