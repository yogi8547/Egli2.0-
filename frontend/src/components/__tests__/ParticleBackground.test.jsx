import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import ParticleBackground from '../ParticleBackground';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock canvas context
const mockContext = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
};

// Track RAF callbacks
let rafCallbacks = [];
let rafIds = [];
let rafIdCounter = 0;
let cancelAnimationFrameCalls = [];

beforeEach(() => {
  vi.useFakeTimers();

  // Track RAF callbacks manually (not using vi.fn() to avoid issues with vi.clearAllMocks / cleanup ordering)
  window.requestAnimationFrame = (cb) => {
    const id = ++rafIdCounter;
    rafCallbacks.push({ id, cb });
    rafIds.push(id);
    return id;
  };

  // Mock cancelAnimationFrame as a plain function so mock clearing doesn't affect it
  window.cancelAnimationFrame = (id) => {
    cancelAnimationFrameCalls.push(id);
    rafCallbacks = rafCallbacks.filter((r) => r.id !== id);
    rafIds = rafIds.filter((i) => i !== id);
  };

  // Mock canvas getContext
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext);

  // Mock clientWidth/clientHeight on parent
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });

  // Mock performance.now
  global.performance = { now: vi.fn(() => 0) };

  // AddEventListener spy
  vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'removeEventListener');
});

afterEach(() => {
  vi.useRealTimers();
  rafCallbacks = [];
  rafIds = [];
  rafIdCounter = 0;
  cancelAnimationFrameCalls = [];
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('ParticleBackground', () => {
  it('renders a canvas element', () => {
    const { container } = render(<ParticleBackground />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('sets canvas class for fixed positioning and no pointer events', () => {
    const { container } = render(<ParticleBackground />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveClass('fixed');
    expect(canvas).toHaveClass('inset-0');
    expect(canvas).toHaveClass('pointer-events-none');
  });

  it('initializes canvas dimensions from parent element', () => {
    render(<ParticleBackground />);
    const canvas = document.querySelector('canvas');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('gets 2d canvas context', () => {
    render(<ParticleBackground />);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
  });

  it('starts the animation loop with requestAnimationFrame', () => {
    render(<ParticleBackground />);
    expect(rafIds.length).toBeGreaterThanOrEqual(1);
  });

  it('registers a resize event listener', () => {
    render(<ParticleBackground />);
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('cleans up on unmount (cancelAnimationFrame + removeEventListener)', () => {
    const { unmount } = render(<ParticleBackground />);
    const rafId = rafIds[0];

    unmount();

    expect(cancelAnimationFrameCalls).toContain(rafId);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('renders at default opacity of 0.6', () => {
    const { container } = render(<ParticleBackground />);
    const canvas = container.querySelector('canvas');
    expect(canvas.style.opacity).toBe('0.6');
  });

  it('calls clearRect on each animation frame', () => {
    render(<ParticleBackground />);

    // Execute the first animation frame callback
    act(() => {
      const firstRaf = rafCallbacks[0];
      if (firstRaf) {
        firstRaf.cb(16); // simulate ~16ms
      }
    });

    // Should request the next frame (initial + from animate callback)
    expect(rafIds.length).toBeGreaterThanOrEqual(2);

    // clearRect should have been called
    expect(mockContext.clearRect).toHaveBeenCalled();
  });

  it('handles resize after mount', () => {
    const { container } = render(<ParticleBackground />);

    // Get the resize handler that was registered
    const resizeHandler = window.addEventListener.mock.calls.find(
      ([event]) => event === 'resize'
    )[1];

    // Change the parent dimensions
    const canvas = container.querySelector('canvas');
    const parent = canvas.parentElement;
    Object.defineProperty(parent, 'clientWidth', { value: 1024 });
    Object.defineProperty(parent, 'clientHeight', { value: 768 });

    // Trigger resize
    act(() => {
      resizeHandler();
    });

    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });
});
