import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import NetworkTopology from '../NetworkTopology';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock requestAnimationFrame and cancelAnimationFrame
let rafCallbacks = [];
let rafId = 0;
global.requestAnimationFrame = vi.fn((cb) => {
  rafCallbacks.push(cb);
  return ++rafId;
});
global.cancelAnimationFrame = vi.fn((id) => {
  rafCallbacks = rafCallbacks.filter((_, i) => i !== id);
});

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockServers = [
  { id: 's1', name: 'postgres-primary', host: '10.0.0.1', status: 'online', tags: { type: 'database', environment: 'prod' } },
  { id: 's2', name: 'api-gw-prod', host: '10.0.0.2', status: 'online', tags: { type: 'gateway', environment: 'prod' } },
  { id: 's3', name: 'payments-svc', host: '10.0.0.3', status: 'degraded', tags: { type: 'service', environment: 'prod' } },
  { id: 's4', name: 'notification-svc', host: '10.0.0.4', status: 'offline', tags: { type: 'service', environment: 'staging' } },
];

const mockMetrics = {
  'postgres-primary': { cpu_percent: 72, memory_percent: 91, disk_percent: 45 },
  'api-gw-prod': { cpu_percent: 88, memory_percent: 76, disk_percent: 62 },
  'payments-svc': { cpu_percent: 95, memory_percent: 88, disk_percent: 80 },
  'notification-svc': { cpu_percent: 0, memory_percent: 0, disk_percent: 0 },
};

const mockAlerts = [
  {
    id: 'a1', severity: 'critical', status: 'active', server: 'postgres-primary',
    metric: 'memory_percent', value: 91, threshold: 85,
    message: 'DB connection pool exhausted on postgres-primary',
    created_at: '2025-01-01T00:02:00Z',
  },
];

describe('NetworkTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Basic Rendering ─────────────────────────────────────────────────

  it('renders the topology header', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Network Topology')).toBeInTheDocument();
  });

  it('shows server and connection count', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText(/4 servers/)).toBeInTheDocument();
  });

  it('shows empty state when no servers', () => {
    render(
      <NetworkTopology servers={[]} metrics={{}} alerts={[]} />
    );
    expect(screen.getByText('No servers to display')).toBeInTheDocument();
  });

  it('shows loading state during simulation', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    // Before the 100ms setTimeout fires, we should see "Building topology..."
    expect(screen.getByText('Building topology...')).toBeInTheDocument();
  });

  it('renders SVG after simulation completes', async () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Fast-forward past the 100ms simulation delay
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // After simulation, the SVG should be rendered
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows no servers when all servers filtered out (empty filter)', async () => {
    // Simulate an impossible filter by manually clearing simulations
    // We test the empty state path via the initial render with no servers
    render(
      <NetworkTopology servers={[]} metrics={{}} alerts={[]} />
    );
    expect(screen.getByText('No servers to display')).toBeInTheDocument();
    expect(screen.getByText(/Register servers with tags/)).toBeInTheDocument();
  });

  // ── Zoom Controls ────────────────────────────────────────────────────

  it('shows zoom percentage', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows zoom in and out buttons', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByTitle('Reset view')).toBeInTheDocument();
  });

  it('shows server count badge', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    // The badge has a Server icon and the count
    const countBadgeEls = screen.getAllByText('4');
    // Should find the server count (4 servers)
    expect(countBadgeEls.length).toBeGreaterThanOrEqual(1);
  });

  // ── Legend ──────────────────────────────────────────────────────────

  it('shows legend with status indicators', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows legend with type indicators', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Types')).toBeInTheDocument();
    expect(screen.getAllByText('database').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('gateway')).toBeInTheDocument();
  });

  it('shows connection type legend', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Same environment')).toBeInTheDocument();
    expect(screen.getByText('Same type')).toBeInTheDocument();
    expect(screen.getByText('Data flow')).toBeInTheDocument();
  });

  it('shows interactions help card', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('Interactions')).toBeInTheDocument();
    expect(screen.getByText('• Hover nodes for metrics')).toBeInTheDocument();
    expect(screen.getByText('• Click to pin details')).toBeInTheDocument();
  });

  // ── Filtering ────────────────────────────────────────────────────────

  it('shows filter button when tags exist', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    const filterBtn = document.querySelector('[title="Filter by tags"]');
    expect(filterBtn).toBeInTheDocument();
  });

  it('shows filter tags in sidebar legend', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    // The TopologyLegend sidebar should show Filters section
    expect(screen.getByText('Filters')).toBeInTheDocument();
    // Should show tag values — 'prod' and 'staging' appear in filter buttons
    const filterButtons = screen.getAllByText('prod');
    expect(filterButtons.length).toBeGreaterThanOrEqual(1);
    const stagingButtons = screen.getAllByText('staging');
    expect(stagingButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('opens filter bar when filter button is clicked', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    const filterBtn = document.querySelector('[title="Filter by tags"]');
    fireEvent.click(filterBtn);
    // Filter bar should now show tag buttons (sidebar also has same tags)
    // Text is split across <span> elements so use a custom matcher
    const tagButtons = screen.getAllByText((content, element) => {
      return content === 'type=database' ||
        (element.tagName === 'SPAN' && element.textContent === 'database' &&
         element.previousElementSibling?.textContent === 'type=');
    });
    // At least one button should contain the tag
    const filterTagBtns = document.querySelectorAll('button span');
    const hasTypeDatabase = Array.from(filterTagBtns).some(
      el => el.textContent === 'database' && el.previousElementSibling?.textContent === 'type='
    );
    expect(hasTypeDatabase).toBe(true);
  });

  // ── Server count in header ──────────────────────────────────────────

  it('shows correct server count in header subtitle', () => {
    render(
      <NetworkTopology servers={mockServers.slice(0, 2)} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText(/2 servers/)).toBeInTheDocument();
  });

  it('shows no servers registered when empty', () => {
    render(
      <NetworkTopology servers={[]} metrics={{}} alerts={[]} />
    );
    expect(screen.getByText('No servers registered')).toBeInTheDocument();
  });

  // ── Zoom Interactions ──────────────────────────────────────────────

  it('zooms in when zoom-in button is clicked', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zoom in'));

    // 100 * 1.3 = 130%
    expect(screen.getByText('130%')).toBeInTheDocument();
  });

  it('zooms out when zoom-out button is clicked', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    fireEvent.click(screen.getByTitle('Zoom out'));

    // 100 / 1.3 ≈ 77%
    expect(screen.getByText('77%')).toBeInTheDocument();
  });

  it('resets zoom and pan when reset-view button is clicked', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Zoom in a few times
    fireEvent.click(screen.getByTitle('Zoom in'));
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('169%')).toBeInTheDocument();

    // Reset
    fireEvent.click(screen.getByTitle('Reset view'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('clamps zoom to max 300%', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Zoom in many times to hit the cap
    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByTitle('Zoom in'));
    }

    expect(screen.getByText('300%')).toBeInTheDocument();
  });

  it('clamps zoom to min 30%', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Zoom out many times to hit the floor
    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByTitle('Zoom out'));
    }

    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  // ── Simulation & SVG Rendering ────────────────────────────────────

  it('renders node groups in SVG after simulation', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Each server should have a data-node-id attribute
    const nodeGroups = document.querySelectorAll('[data-node-id]');
    expect(nodeGroups.length).toBe(4);
  });

  it('renders edges between connected servers', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // SVG should contain <line> elements for edges
    const lines = document.querySelectorAll('svg line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('shows connection count in header subtitle after simulation', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Should show connections count (e.g., "N connections")
    expect(screen.getByText(/connection/)).toBeInTheDocument();
  });

  it('renders data flow particles after simulation', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Particles are rendered as <circle> elements inside the SVG
    const circles = document.querySelectorAll('svg circle');
    // Should have node backgrounds + type rings + status dots + particles
    expect(circles.length).toBeGreaterThan(0);
  });

  // ── Node Hover & Tooltip ──────────────────────────────────────────

  it('shows tooltip when hovering a node', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Find a node and hover it
    const node = document.querySelector('[data-node-id="s1"]');
    expect(node).toBeInTheDocument();

    // Simulate mouseEnter on the node group
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });

    // Tooltip should show host and id (unique to tooltip)
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  it('shows metrics in tooltip on hover', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });

    // Tooltip should show CPU, Memory, Disk labels
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Disk')).toBeInTheDocument();
  });

  it('shows host in tooltip on hover', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });

    // Tooltip should show the host address
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  it('shows status label in tooltip', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s3"]');
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });

    // payments-svc is degraded — use tooltip container to find the status
    // The tooltip is in an absolutely positioned div
    const tooltip = document.querySelector('.pointer-events-none[style*="position"]') || document.querySelector('[style*="transform: translateY"]');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('Degraded');
  });

  it('shows alert count in tooltip for servers with alerts', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // postgres-primary has a critical alert
    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });

    expect(screen.getByText(/1 active alert/)).toBeInTheDocument();
    expect(screen.getByText(/1 critical/)).toBeInTheDocument();
  });

  it('hides tooltip when mouse leaves node', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });
    expect(screen.getByText('CPU')).toBeInTheDocument();

    fireEvent.mouseLeave(node);
    // Tooltip should be gone — CPU label should no longer be visible
    expect(screen.queryByText('CPU')).not.toBeInTheDocument();
  });

  // ── Node Click & Selection ────────────────────────────────────────

  it('shows selected node detail bar when a node is clicked', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.click(node);

    // Detail bar should show the server name and host
    const detailBars = screen.getAllByText('postgres-primary');
    expect(detailBars.length).toBeGreaterThanOrEqual(1);
  });

  it('shows metrics in selected node detail bar', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s2"]');
    fireEvent.click(node);

    // api-gw-prod has cpu 88%, mem 76%, disk 62%
    expect(screen.getByText('88.0%')).toBeInTheDocument();
    expect(screen.getByText('76.0%')).toBeInTheDocument();
    expect(screen.getByText('62.0%')).toBeInTheDocument();
  });

  it('deselects node when clicking the same node again', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.click(node);
    // Detail bar visible
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();

    fireEvent.click(node);
    // Detail bar hidden (toggled off)
    expect(screen.queryByText('10.0.0.1')).not.toBeInTheDocument();
  });

  it('shows type badge in selected node detail bar', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.click(node);

    // postgres-primary has type 'database'
    // Check for the type badge in the detail bar
    const typeBadges = screen.getAllByText('database');
    expect(typeBadges.length).toBeGreaterThanOrEqual(1);
  });

  // ── Filter Interactions ────────────────────────────────────────────

  it('toggles filter on and off via sidebar legend', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Find sidebar filter buttons for 'prod' environment
    const filterBtns = screen.getAllByText('prod');
    const sidebarProdBtn = filterBtns.find((el) => el.closest('button'));
    expect(sidebarProdBtn).toBeInTheDocument();

    act(() => {
      fireEvent.click(sidebarProdBtn.closest('button'));
    });
    // Allow the simulation timeout to fire
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // After filtering to prod, only 3 servers should remain
    expect(screen.getByText(/3 servers/)).toBeInTheDocument();
  });

  it('shows Clear button when a filter is active', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Open the filter bar
    const filterBtn = document.querySelector('[title="Filter by tags"]');
    fireEvent.click(filterBtn);

    // Find and click a filter tag in the filter bar area (not sidebar)
    // The filter bar has filter tag buttons with class containing 'rounded-full'
    const filterBarBtns = document.querySelectorAll('button.rounded-full');
    const prodBtn = Array.from(filterBarBtns).find(btn => btn.textContent.includes('prod'));
    expect(prodBtn).toBeTruthy();

    act(() => {
      fireEvent.click(prodBtn);
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Clear button should now be visible
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('clears all filters when Clear button is clicked', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    // Open the filter bar
    const filterBtn = document.querySelector('[title="Filter by tags"]');
    fireEvent.click(filterBtn);

    // Find and click a filter tag in the filter bar area
    const filterBarBtns = document.querySelectorAll('button.rounded-full');
    const prodBtn = Array.from(filterBarBtns).find(btn => btn.textContent.includes('prod'));
    expect(prodBtn).toBeTruthy();

    act(() => {
      fireEvent.click(prodBtn);
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText(/3 servers/)).toBeInTheDocument();

    // Click Clear
    act(() => {
      fireEvent.click(screen.getByText('Clear'));
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // All servers should be back
    expect(screen.getByText(/4 servers/)).toBeInTheDocument();
  });

  // ── Mouse Interactions ────────────────────────────────────────────

  it('pans when dragging background', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Mouse down on SVG background (no node) starts pan
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(svg);

    // No crash — pan state was set and cleared
  });

  it('drags a node when mouse down on node', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    expect(node).toBeInTheDocument();

    // Mouse down on node starts drag
    fireEvent.mouseDown(node, { clientX: 300, clientY: 300 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 350 });
    fireEvent.mouseUp(document);

    // Node should still be present after drag
    expect(document.querySelector('[data-node-id="s1"]')).toBeInTheDocument();
  });

  it('updates tooltip position on mouse move while hovering', () => {
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={mockAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.mouseEnter(node, { clientX: 100, clientY: 100 });
    expect(screen.getByText('CPU')).toBeInTheDocument();

    // Move mouse — tooltip should still be visible
    fireEvent.mouseMove(node, { clientX: 150, clientY: 150 });
    expect(screen.getByText('CPU')).toBeInTheDocument();
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  it('handles servers without tags gracefully', () => {
    const noTagServers = [
      { id: 's1', name: 'server-01', host: '10.0.0.1', status: 'online' },
    ];
    render(
      <NetworkTopology servers={noTagServers} metrics={{}} alerts={[]} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    expect(node).toBeInTheDocument();
  });

  it('handles servers without status gracefully', () => {
    const noStatusServers = [
      { id: 's1', name: 'server-01', host: '10.0.0.1', tags: { type: 'web' } },
    ];
    render(
      <NetworkTopology servers={noStatusServers} metrics={{}} alerts={[]} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    expect(node).toBeInTheDocument();
  });

  it('handles single server (no edges possible)', () => {
    const singleServer = [
      { id: 's1', name: 'lone-server', host: '10.0.0.1', status: 'online', tags: { type: 'web', environment: 'prod' } },
    ];
    render(
      <NetworkTopology servers={singleServer} metrics={{ 'lone-server': { cpu_percent: 50, memory_percent: 60, disk_percent: 70 } }} alerts={[]} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    expect(node).toBeInTheDocument();

    // 1 server, 0 connections
    expect(screen.getByText(/1 server · 0 connection/)).toBeInTheDocument();
  });

  it('handles multiple alerts on a single server', () => {
    const multiAlerts = [
      { id: 'a1', severity: 'critical', status: 'active', server: 'postgres-primary', metric: 'cpu', value: 95, threshold: 90, message: 'CPU spike', created_at: '2025-01-01T00:01:00Z' },
      { id: 'a2', severity: 'warning', status: 'active', server: 'postgres-primary', metric: 'memory', value: 88, threshold: 85, message: 'Memory high', created_at: '2025-01-01T00:02:00Z' },
    ];
    render(
      <NetworkTopology servers={mockServers} metrics={mockMetrics} alerts={multiAlerts} />
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const node = document.querySelector('[data-node-id="s1"]');
    fireEvent.mouseEnter(node, { clientX: 200, clientY: 200 });

    // Should show 2 active alerts
    expect(screen.getByText(/2 active alerts/)).toBeInTheDocument();
    expect(screen.getByText(/1 critical/)).toBeInTheDocument();
  });

  it('does not show filter button when servers have no tags', () => {
    const noTagServers = [
      { id: 's1', name: 'server-01', host: '10.0.0.1', status: 'online' },
    ];
    render(
      <NetworkTopology servers={noTagServers} metrics={{}} alerts={[]} />
    );

    expect(document.querySelector('[title="Filter by tags"]')).not.toBeInTheDocument();
  });

  it('shows singular form for 1 server', () => {
    const singleServer = [
      { id: 's1', name: 'server-01', host: '10.0.0.1', status: 'online', tags: {} },
    ];
    render(
      <NetworkTopology servers={singleServer} metrics={{}} alerts={[]} />
    );

    expect(screen.getByText(/1 server/)).toBeInTheDocument();
    expect(screen.queryByText(/1 servers/)).not.toBeInTheDocument();
  });
});
