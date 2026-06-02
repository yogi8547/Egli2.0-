import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '../Toast';

// ── Fixtures ─────────────────────────────────────────────────────────────

function TestConsumer({ type, title, message, duration }) {
  const { addToast } = useToast();
  return (
    <button
      data-testid="trigger-toast"
      onClick={() => addToast({ type, title, message, duration })}
    >
      Trigger Toast
    </button>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Hello</div>
      </ToastProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows a toast when addToast is called', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Server Alert" message="CPU at 95%" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Server Alert')).toBeInTheDocument();
    expect(screen.getByText('CPU at 95%')).toBeInTheDocument();
  });

  it('renders toast without optional message', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Info" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('renders different toast types with appropriate icons', () => {
    const { rerender } = render(
      <ToastProvider>
        <TestConsumer type="critical" title="Critical" message="test" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders warning type toasts', () => {
    render(
      <ToastProvider>
        <TestConsumer type="warning" title="Warning Toast" message="Disk at 90%" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Warning Toast')).toBeInTheDocument();
    expect(screen.getByText('Disk at 90%')).toBeInTheDocument();
  });

  it('renders info type toasts', () => {
    render(
      <ToastProvider>
        <TestConsumer type="info" title="Info Toast" message="Something happened" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Info Toast')).toBeInTheDocument();
    expect(screen.getByText('Something happened')).toBeInTheDocument();
  });

  it('renders success type toasts', () => {
    render(
      <ToastProvider>
        <TestConsumer type="success" title="Success Toast" message="All good" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Success Toast')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders alert type toasts', () => {
    render(
      <ToastProvider>
        <TestConsumer type="alert" title="Alert Toast" message="Check logs" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Alert Toast')).toBeInTheDocument();
    expect(screen.getByText('Check logs')).toBeInTheDocument();
  });

  it('dismisses a toast when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Dismiss Me" message="click to dismiss" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Dismiss Me')).toBeInTheDocument();

    // Find and click the close button (X icon button)
    const closeBtn = document.querySelector('[class*="hover:text-white hover:bg-dark-700"]');
    act(() => {
      fireEvent.click(closeBtn);
    });

    // Run the exit animation timeout (300ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText('Dismiss Me')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after the default duration (5000ms)', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Auto Dismiss" message="will disappear" duration={5000} />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-toast'));
    });
    expect(screen.getByText('Auto Dismiss')).toBeInTheDocument();

    // Advance time to just before dismissal
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.getByText('Auto Dismiss')).toBeInTheDocument();

    // Advance past the remaining time (50ms enter + 5000ms dismiss)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Should still be in exiting phase (300ms exit animation)
    // After exit animation completes
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText('Auto Dismiss')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss when duration is 0', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Persistent" message="stays forever" duration={0} />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-toast'));
    });
    expect(screen.getByText('Persistent')).toBeInTheDocument();

    // Advance a long time
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Persistent')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    function MultiTrigger() {
      const { addToast } = useToast();
      return (
        <div>
          <button data-testid="toast-1" onClick={() => addToast({ title: 'First', message: 'msg1' })}>Toast 1</button>
          <button data-testid="toast-2" onClick={() => addToast({ title: 'Second', message: 'msg2' })}>Toast 2</button>
        </div>
      );
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByTestId('toast-1'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('toast-2'));
    });

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('msg1')).toBeInTheDocument();
    expect(screen.getByText('msg2')).toBeInTheDocument();
  });

  it('uses default type "info" when no type provided', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Default Type" message="should show info icon" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTestId('trigger-toast'));
    expect(screen.getByText('Default Type')).toBeInTheDocument();
  });

  it('uses default duration of 5000ms', () => {
    render(
      <ToastProvider>
        <TestConsumer title="Default Duration" message="auto dismiss" />
      </ToastProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-toast'));
    });

    act(() => {
      vi.advanceTimersByTime(5000 + 50 + 300);
    });
    expect(screen.queryByText('Default Duration')).not.toBeInTheDocument();
  });
});

describe('useToast', () => {
  it('throws when used outside ToastProvider', () => {
    // Suppress console.error for this expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadComponent() {
      useToast();
      return <div />;
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useToast must be used within ToastProvider'
    );
    consoleSpy.mockRestore();
  });
});
