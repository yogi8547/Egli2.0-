import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CountdownTimer from '../CountdownTimer';

// ── Tests ───────────────────────────────────────────────────────────────

describe('CountdownTimer', () => {
  it('renders an SVG element', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders the remaining count as text', () => {
    render(<CountdownTimer seconds={60} remaining={30} />);
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows the correct title attribute', () => {
    render(<CountdownTimer seconds={60} remaining={30} />);
    const containerEl = screen.getByText('30').closest('[title]');
    expect(containerEl).toHaveAttribute('title', 'Next poll in 30s');
  });

  it('uses default size of 36', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '36');
    expect(svg).toHaveAttribute('height', '36');
  });

  it('uses custom size when provided', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('renders both background and progress rings', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} />);
    const circles = container.querySelectorAll('circle');
    // Background ring + progress ring
    expect(circles.length).toBe(2);
  });

  it('uses green (#a3be8c) stroke when progress > 30%', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} />);
    const progressCircle = container.querySelectorAll('circle')[1];
    expect(progressCircle).toHaveAttribute('stroke', '#a3be8c');
  });

  it('uses yellow (#ebcb8b) stroke when progress <= 30% and > 15%', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={15} />);
    const progressCircle = container.querySelectorAll('circle')[1];
    expect(progressCircle).toHaveAttribute('stroke', '#ebcb8b');
  });

  it('uses red (#bf616a) stroke when progress <= 15%', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={5} />);
    const progressCircle = container.querySelectorAll('circle')[1];
    expect(progressCircle).toHaveAttribute('stroke', '#bf616a');
  });

  it('uses red stroke when remaining is 0', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={0} />);
    const progressCircle = container.querySelectorAll('circle')[1];
    expect(progressCircle).toHaveAttribute('stroke', '#bf616a');
  });

  it('has rounded stroke linecap on progress ring', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} />);
    const progressCircle = container.querySelectorAll('circle')[1];
    expect(progressCircle).toHaveAttribute('stroke-linecap', 'round');
  });

  it('has transition class on progress ring', () => {
    const { container } = render(<CountdownTimer seconds={60} remaining={30} />);
    const progressCircle = container.querySelectorAll('circle')[1];
    // SVG elements return SVGAnimatedString for className; use getAttribute
    const cls = progressCircle.getAttribute('class');
    expect(cls).toContain('transition-all');
  });
});
