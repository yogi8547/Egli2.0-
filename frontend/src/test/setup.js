import '@testing-library/jest-dom';

// Suppress known cosmetic warnings from jsdom test environment:
// 1. act() warnings from async effects (not real bugs)
// 2. SVG element/prop warnings (jsdom doesn't support SVG natively)
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  // Suppress act() warnings
  if (msg.includes('not wrapped in act') || msg.includes('Inside a test scope')) {
    return;
  }
  // Suppress SVG tag warnings: "The tag <stop> is unrecognized in this browser"
  // and SVG prop warnings: "React does not recognize the `stopColor` prop"
  // These are all jsdom limitations — SVG works fine in real browsers.
  if (
    msg.includes('unrecognized in this browser') ||
    msg.includes('React does not recognize')
  ) {
    return;
  }
  originalConsoleError(...args);
};

// Mock window.__toast for components that use global toast
window.__toast = {
  addToast: vi.fn(),
};

// Mock fetch for components that make API calls
window.fetch = vi.fn();

// Mock scrollIntoView (not available in JSDOM)
Element.prototype.scrollIntoView = vi.fn();

// Mock ResizeObserver (used by Recharts)
global.ResizeObserver = vi.fn().mockImplementation(function() {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// Mock matchMedia for responsive design checks
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
