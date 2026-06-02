import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoFixButton from '../AutoFixButton';

describe('AutoFixButton', () => {
  const baseAction = {
    action: 'fix-db',
    description: 'Fix database connection',
    command: 'systemctl restart postgresql',
    risk: 'medium',
  };

  it('renders action description and risk badge', () => {
    render(<AutoFixButton action={baseAction} />);
    expect(screen.getByText('Fix database connection')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('renders command text', () => {
    render(<AutoFixButton action={baseAction} />);
    expect(screen.getByText('systemctl restart postgresql')).toBeInTheDocument();
  });

  it('renders with low risk badge', () => {
    const lowAction = { ...baseAction, risk: 'low' };
    render(<AutoFixButton action={lowAction} />);
    const badge = screen.getByText('low');
    expect(badge).toBeInTheDocument();
    // Low risk should have success-themed badge classes
    expect(badge.className).toContain('success');
  });

  it('renders with high risk badge', () => {
    const highAction = { ...baseAction, risk: 'high' };
    render(<AutoFixButton action={highAction} />);
    const badge = screen.getByText('high');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('danger');
  });

  it('shows loading spinner and disables button when executing', () => {
    const { container } = render(
      <AutoFixButton action={baseAction} executing="fix-db" />
    );
    // Terminal icon should NOT be present (replaced by spinner)
    const terminalIcon = container.querySelector('.lucide-terminal');
    expect(terminalIcon).toBeNull();
    // Execute button should be disabled
    const button = screen.getByTitle('Execute action');
    expect(button).toBeDisabled();
  });

  it('shows success output when result is provided', () => {
    const result = {
      action: 'fix-db',
      status: 'success',
      output: 'Command executed successfully',
    };
    const { container } = render(
      <AutoFixButton action={baseAction} result={result} />
    );
    // Terminal icon should NOT be present (replaced by result icon)
    expect(container.querySelector('.lucide-terminal')).toBeNull();
    // Should show output text
    expect(screen.getByText('Command executed successfully')).toBeInTheDocument();
  });

  it('shows failure output when result status is failed', () => {
    const result = {
      action: 'fix-db',
      status: 'failed',
      output: 'Error: failed to restart service',
    };
    const { container } = render(
      <AutoFixButton action={baseAction} result={result} />
    );
    // Terminal icon should NOT be present
    expect(container.querySelector('.lucide-terminal')).toBeNull();
    // Should show output text
    expect(screen.getByText('Error: failed to restart service')).toBeInTheDocument();
  });

  it('calls onExecute when button is clicked', () => {
    const onExecute = vi.fn();
    render(<AutoFixButton action={baseAction} onExecute={onExecute} />);
    const button = screen.getByTitle('Execute action');
    fireEvent.click(button);
    expect(onExecute).toHaveBeenCalledWith(baseAction);
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it('falls back to medium risk styling for unknown risk', () => {
    const unknownAction = { ...baseAction, risk: 'unknown' };
    render(<AutoFixButton action={unknownAction} />);
    const badge = screen.getByText('unknown');
    expect(badge.className).toContain('warning');
  });

  it('truncates long output to 120 characters', () => {
    const longOutput = 'a'.repeat(200);
    const expectedTruncated = 'a'.repeat(120);
    const result = {
      action: 'fix-db',
      status: 'success',
      output: longOutput,
    };
    render(<AutoFixButton action={baseAction} result={result} />);
    // Use a text match function to find truncated output
    const outputElement = screen.getByText((content) => content === expectedTruncated);
    expect(outputElement).toBeInTheDocument();
  });
});
