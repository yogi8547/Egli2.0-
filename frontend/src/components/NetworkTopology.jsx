/**
 * NetworkTopology — Interactive network topology visualization with
 * force-directed graph layout, live server status, and data flow animation.
 *
 * Features:
 * - Force-directed layout with simulated annealing
 * - Server nodes with status colors and glow effects
 * - Inferred connections from tag groupings (environment, type)
 * - Animated data flow particles along edges
 * - Drag, zoom, pan interactions
 * - Hover tooltips with live metrics
 * - Filter by environment/type tags
 * - Legend with status and type color coding
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Server,
  Activity,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  X,
  Cpu,
  HardDrive,
  MemoryStick,
  AlertTriangle,
  Network,
  Wifi,
  WifiOff,
  Minus,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────

const NODE_RADIUS = 30;
const REPULSION = 8000;
const ATTRACTION = 0.008;
const DAMPING = 0.88;
const MIN_ENERGY = 0.5;
const MAX_SPEED = 10;
const CENTER_GRAVITY = 0.015;
const SIMULATION_ITERATIONS = 200;

const STATUS_COLORS = {
  online: { fill: '#a3be8c', glow: 'rgba(163, 190, 140, 0.5)', label: 'Online' },
  offline: { fill: '#bf616a', glow: 'rgba(191, 97, 106, 0.5)', label: 'Offline' },
  degraded: { fill: '#ebcb8b', glow: 'rgba(235, 203, 139, 0.5)', label: 'Degraded' },
  unknown: { fill: '#606060', glow: 'rgba(96, 96, 96, 0.3)', label: 'Unknown' },
};

const TYPE_COLORS = {
  web: '#00B9F1',
  database: '#b48ead',
  cache: '#a3be8c',
  monitoring: '#00D4FF',
  worker: '#d08770',
  loadbalancer: '#ebcb8b',
  server: '#00B9F1',
  default: '#00B9F1',
};

const EDGE_COLORS = {
  environment: 'rgba(0, 185, 241, 0.25)',
  type: 'rgba(180, 142, 173, 0.2)',
  default: 'rgba(0, 185, 241, 0.15)',
};

const EDGE_WIDTHS = {
  environment: 1.5,
  type: 1,
  default: 0.8,
};

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Infer logical connections between servers based on tag similarities.
 * Servers sharing the same environment or type are connected.
 */
function generateEdges(servers) {
  const edges = [];
  const seen = new Set();

  function addEdge(source, target, type, label) {
    const key = [source, target].sort().join(':');
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, type, label });
  }

  // Connect servers in the same environment (full mesh within environment)
  const byEnv = {};
  servers.forEach((s) => {
    const env = s.tags?.environment || 'default';
    if (!byEnv[env]) byEnv[env] = [];
    byEnv[env].push(s);
  });
  Object.entries(byEnv).forEach(([env, group]) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addEdge(group[i].id, group[j].id, 'environment', env);
      }
    }
  });

  // Connect servers of the same type (star per type — hub and spoke)
  const byType = {};
  servers.forEach((s) => {
    const type = s.tags?.type || 'server';
    if (!byType[type]) byType[type] = [];
    byType[type].push(s);
  });
  Object.entries(byType).forEach(([type, group]) => {
    if (group.length < 2) return;
    const hub = group[0];
    for (let i = 1; i < group.length; i++) {
      addEdge(hub.id, group[i].id, 'type', type);
    }
  });

  return edges;
}

/**
 * Initialize node positions in a circular layout for a good starting
 * point, then let the force simulation refine it.
 */
function initializeNodes(servers, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;

  return servers.map((s, i) => {
    const angle = (2 * Math.PI * i) / servers.length - Math.PI / 2;
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      status: s.status || 'unknown',
      tags: s.tags || {},
      type: s.tags?.type || s.name.toLowerCase().includes('db') || s.name.toLowerCase().includes('database') ? 'database'
        : s.name.toLowerCase().includes('cache') ? 'cache'
        : s.name.toLowerCase().includes('monitor') ? 'monitoring'
        : s.name.toLowerCase().includes('worker') ? 'worker'
        : s.name.toLowerCase().includes('lb') || s.name.toLowerCase().includes('load') ? 'loadbalancer'
        : s.tags?.type || 'server',
      environment: s.tags?.environment || 'default',
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      pinned: false,
    };
  });
}

/**
 * Run a force-directed layout simulation until convergence.
 */
function runSimulation(nodes, edges, width, height) {
  for (let iter = 0; iter < SIMULATION_ITERATIONS; iter++) {
    let totalEnergy = 0;

    // Repulsion: all pairs repel each other
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        // Clamp to avoid infinite forces
        dist = Math.max(dist, 20);
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attraction: connected nodes attract each other (springs)
    for (const edge of edges) {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Ideal distance scales with number of nodes
      const idealDist = Math.max(120, Math.min(300, 600 / Math.sqrt(nodes.length)));
      const displacement = dist - idealDist;
      const force = ATTRACTION * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    // Center gravity — pull everything toward the center
    for (const node of nodes) {
      if (node.pinned) continue;
      node.vx += (width / 2 - node.x) * CENTER_GRAVITY;
      node.vy += (height / 2 - node.y) * CENTER_GRAVITY;
    }

    // Apply damping, update positions
    for (const node of nodes) {
      if (node.pinned) continue;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > MAX_SPEED) {
        node.vx = (node.vx / speed) * MAX_SPEED;
        node.vy = (node.vy / speed) * MAX_SPEED;
      }
      node.x += node.vx;
      node.y += node.vy;
      // Keep within bounds with padding
      const pad = NODE_RADIUS + 20;
      node.x = Math.max(pad, Math.min(width - pad, node.x));
      node.y = Math.max(pad, Math.min(height - pad, node.y));
      totalEnergy += speed * speed;
    }

    if (totalEnergy < MIN_ENERGY) break;
  }
  return nodes;
}

/**
 * Create particles for data flow animation along edges.
 */
function generateParticles(edges) {
  const particles = [];
  for (const edge of edges) {
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      particles.push({
        edgeKey: `${edge.source}:${edge.target}`,
        source: edge.source,
        target: edge.target,
        progress: Math.random(),
        speed: 0.0015 + Math.random() * 0.003,
        size: 2 + Math.random() * 2.5,
        opacity: 0.3 + Math.random() * 0.4,
      });
    }
  }
  return particles;
}

/**
 * Get the type color for a node.
 */
function getNodeTypeColor(node) {
  return TYPE_COLORS[node.type] || TYPE_COLORS.default;
}

/**
 * Get status color info for a node.
 */
function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.unknown;
}

/**
 * Get edge color based on connection type.
 */
function getEdgeColor(type) {
  return EDGE_COLORS[type] || EDGE_COLORS.default;
}

/**
 * Get edge width based on connection type.
 */
function getEdgeWidth(type) {
  return EDGE_WIDTHS[type] || EDGE_WIDTHS.default;
}

/**
 * Compute position along an edge by progress (0-1).
 */
function getPointOnEdge(sourceNode, targetNode, progress) {
  return {
    x: sourceNode.x + (targetNode.x - sourceNode.x) * progress,
    y: sourceNode.y + (targetNode.y - sourceNode.y) * progress,
  };
}

// ── Node Icon ────────────────────────────────────────────────────────────

function getNodeIcon(type) {
  // These map to the type key used in rendering
  return type;
}

// ── Sub-components ──────────────────────────────────────────────────────

function TopologyLegend({ activeFilters, onToggleFilter, availableTags }) {
  const statusEntries = Object.entries(STATUS_COLORS);
  const typeEntries = Object.entries(TYPE_COLORS).filter(([key]) => key !== 'default');

  return (
    <div className="glass-card p-3 w-52">
      <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">Status</h4>
      <div className="space-y-1 mb-3">
        {statusEntries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: val.fill }}
            />
            <span className="text-[10px] text-gray-500">{val.label}</span>
          </div>
        ))}
      </div>

      <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">Types</h4>
      <div className="space-y-1">
        {typeEntries.map(([key, color]) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-gray-500 capitalize">{key}</span>
          </div>
        ))}
      </div>

      {availableTags.length > 0 && (
        <>
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 mt-3">
            Filters
          </h4>
          <div className="space-y-1">
            {availableTags.map((tag) => {
              const isActive = activeFilters.some(
                (f) => f.key === tag.key && f.value === tag.value
              );
              return (
                <button
                  key={`${tag.key}=${tag.value}`}
                  onClick={() => onToggleFilter(tag)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] transition-all ${
                    isActive
                      ? 'bg-accent-500/20 text-accent-500'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-dark-800/50'
                  }`}
                >
                  <span className="text-[9px] opacity-60">{tag.key}=</span>
                  <span>{tag.value}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export default function NetworkTopology({ servers, metrics, alerts }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const animFrameRef = useRef(null);

  // ── State ────────────────────────────────────────────────────────────
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [particles, setParticles] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragNode, setDragNode] = useState(null);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [activeFilters, setActiveFilters] = useState([]);
  const [simulated, setSimulated] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // ── Derive available tag filters ─────────────────────────────────────
  const availableTags = useMemo(() => {
    const tagSet = new Set();
    servers.forEach((s) => {
      if (s.tags) {
        Object.entries(s.tags).forEach(([key, value]) => {
          tagSet.add(JSON.stringify({ key, value }));
        });
      }
    });
    return Array.from(tagSet).map((s) => JSON.parse(s));
  }, [servers]);

  // ── Filtered servers based on active tags ────────────────────────────
  const filteredServers = useMemo(() => {
    if (activeFilters.length === 0) return servers;
    return servers.filter((s) =>
      activeFilters.every((f) => s.tags && s.tags[f.key] === f.value)
    );
  }, [servers, activeFilters]);

  // ── Handle filter toggle ────────────────────────────────────────────
  const handleToggleFilter = useCallback((tag) => {
    setActiveFilters((prev) => {
      const exists = prev.findIndex((f) => f.key === tag.key && f.value === tag.value);
      if (exists >= 0) return prev.filter((_, i) => i !== exists);
      return [...prev, tag];
    });
    setSimulated(false);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
    setSimulated(false);
  }, []);

  // ── Resize observer ───────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.max(400, width), height: Math.max(300, height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Run simulation when servers/filters change ──────────────────────
  useEffect(() => {
    if (filteredServers.length === 0) {
      setNodes([]);
      setEdges([]);
      setParticles([]);
      setSimulated(false);
      return;
    }

    // Small delay to allow the container to layout
    const timer = setTimeout(() => {
      const container = containerRef.current;
      const w = container?.clientWidth || 800;
      const h = container?.clientHeight || 600;

      const newEdges = generateEdges(filteredServers);
      let newNodes = initializeNodes(filteredServers, w, h);
      newNodes = runSimulation(newNodes, newEdges, w, h);
      const newParticles = generateParticles(newEdges);

      setNodes(newNodes);
      setEdges(newEdges);
      setParticles(newParticles);
      setSimulated(true);
    }, 100);

    return () => clearTimeout(timer);
  }, [filteredServers]);

  // ── Particle animation loop ──────────────────────────────────────────
  useEffect(() => {
    if (!simulated || particles.length === 0) return;

    let running = true;

    function animate() {
      if (!running) return;

      setParticles((prev) =>
        prev.map((p) => {
          let newProgress = p.progress + p.speed;
          if (newProgress > 1) newProgress -= 1;
          return { ...p, progress: newProgress };
        })
      );

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [simulated, particles.length]);

  // ── Get current metrics for a server node ────────────────────────────
  const getNodeMetrics = useCallback(
    (node) => {
      const m = metrics[node.name] || metrics[node.id] || {};
      return {
        cpu: m.cpu_percent || 0,
        mem: m.memory_percent || 0,
        disk: m.disk_percent || 0,
      };
    },
    [metrics]
  );

  // ── Get active alert count for a server ───────────────────────────────
  const getNodeAlertCount = useCallback(
    (node) => {
      return (alerts || []).filter(
        (a) => a.server === node.name && a.status === 'active'
      ).length;
    },
    [alerts]
  );

  // ── Get critical alert count ─────────────────────────────────────────
  const getNodeCriticalAlerts = useCallback(
    (node) => {
      return (alerts || []).filter(
        (a) => a.server === node.name && a.severity === 'critical' && a.status === 'active'
      ).length;
    },
    [alerts]
  );

  // ── Zoom controls ────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * 1.3, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev / 1.3, 0.3));
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ── Mouse wheel zoom ──────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.3, Math.min(3, prev * delta)));
  }, []);

  // ── Mouse down: start drag or pan ────────────────────────────────────
  const handleMouseDown = useCallback(
    (e) => {
      const target = e.target;
      const nodeId = target.dataset?.nodeId || target.closest('[data-node-id]')?.dataset?.nodeId;

      if (nodeId) {
        // Start dragging a node
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          setIsDragging(true);
          setDragNode(nodeId);
          // Pin the node so simulation doesn't fight the drag
          setNodes((prev) =>
            prev.map((n) => (n.id === nodeId ? { ...n, pinned: true } : n))
          );
        }
      } else {
        // Start panning
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [nodes, pan]
  );

  // ── Mouse move: drag node or pan ──────────────────────────────────────
  const handleMouseMove = useCallback(
    (e) => {
      if (isDragging && dragNode && svgRef.current) {
        const svg = svgRef.current;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        setNodes((prev) =>
          prev.map((n) => (n.id === dragNode ? { ...n, x, y } : n))
        );
      } else if (isPanning) {
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      }
    },
    [isDragging, isPanning, dragNode, zoom, pan, panStart]
  );

  // ── Mouse up: end drag/pan ───────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (isDragging && dragNode) {
      // Unpin the node after drag ends
      setNodes((prev) =>
        prev.map((n) => (n.id === dragNode ? { ...n, pinned: false } : n))
      );
    }
    setIsDragging(false);
    setDragNode(null);
    setIsPanning(false);
  }, [isDragging, dragNode]);

  // ── Mouse enter/leave node ────────────────────────────────────────────
  const handleNodeMouseEnter = useCallback((e, node) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setHoveredNode(node);
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const handleNodeMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  // ── Click node to select ─────────────────────────────────────────────
  const handleNodeClick = useCallback((node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  // ── Background click to deselect ─────────────────────────────────────
  const handleBackgroundClick = useCallback((e) => {
    if (e.target === svgRef.current || e.target.classList.contains('topology-bg')) {
      setSelectedNode(null);
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────
  const hasServers = filteredServers.length > 0;
  const hasActiveFilter = activeFilters.length > 0;

  // Edge endpoints (for particles)
  const edgeEndpoints = useMemo(() => {
    const map = {};
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);
      if (source && target) {
        map[`${edge.source}:${edge.target}`] = { source, target };
        map[`${edge.target}:${edge.source}`] = { source: target, target: source };
      }
    });
    return map;
  }, [edges, nodes]);

  const zoomInt = zoom;
  const panX = pan.x;
  const panY = pan.y;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      {/* ── Topology Area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-500/10">
              <Network className="w-4 h-4 text-accent-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Network Topology</h2>
              <p className="text-[10px] text-gray-500">
                {hasServers
                  ? `${filteredServers.length} server${filteredServers.length !== 1 ? 's' : ''} · ${edges.length} connection${edges.length !== 1 ? 's' : ''}`
                  : 'No servers registered'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Filter button */}
            {availableTags.length > 0 && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-1.5 rounded-lg transition-all ${
                  hasActiveFilter
                    ? 'text-accent-500 bg-accent-500/15'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800'
                }`}
                title="Filter by tags"
              >
                <Filter className="w-4 h-4" />
              </button>
            )}

            {/* Zoom controls */}
            <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-0.5">
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-dark-700 transition-all"
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-gray-500 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-dark-700 transition-all"
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={handleResetView}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-800 transition-all"
              title="Reset view"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Server count badge */}
            {hasServers && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-dark-800">
                <Server className="w-3 h-3 text-gray-500" />
                <span className="text-[10px] font-mono text-gray-400">{filteredServers.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && availableTags.length > 0 && (
          <div className="px-4 py-2 border-b border-dark-700/30 bg-dark-900/30">
            <div className="flex items-center gap-1.5 flex-wrap">
              {hasActiveFilter && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-dark-800 rounded-md transition-all"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
              {availableTags.map((tag) => {
                const isActive = activeFilters.some(
                  (f) => f.key === tag.key && f.value === tag.value
                );
                return (
                  <button
                    key={`${tag.key}=${tag.value}`}
                    onClick={() => handleToggleFilter(tag)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
                      isActive
                        ? 'bg-accent-500/20 text-accent-500 border border-accent-500/30'
                        : 'text-gray-500 border border-dark-700/30 hover:text-gray-300 hover:border-dark-600/50'
                    }`}
                  >
                    <span className="text-[9px] opacity-60">{tag.key}=</span>
                    <span>{tag.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SVG Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
          style={{ minHeight: 300 }}
        >
          {!hasServers ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Network className="w-12 h-12 text-gray-600" />
              <p className="text-sm text-gray-400">No servers to display</p>
              <p className="text-xs text-gray-600">
                Register servers with tags to see the topology map
              </p>
            </div>
          ) : !simulated ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 text-gray-500">
                <Activity className="w-4 h-4 animate-spin" />
                <span className="text-sm">Building topology...</span>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="w-full h-full"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleBackgroundClick}
            >
              {/* Zoom/Pan transform group */}
              <g transform={`translate(${panX}, ${panY}) scale(${zoomInt})`}>
                {/* Background click rect */}
                <rect
                  className="topology-bg"
                  x={-5000}
                  y={-5000}
                  width={10000}
                  height={10000}
                  fill="transparent"
                />

                {/* ── Edges ────────────────────────────────────────── */}
                {edges.map((edge) => {
                  const source = nodes.find((n) => n.id === edge.source);
                  const target = nodes.find((n) => n.id === edge.target);
                  if (!source || !target) return null;

                  const isHighlighted =
                    hoveredNode &&
                    (hoveredNode.id === edge.source || hoveredNode.id === edge.target);
                  const isSelectedEdge =
                    selectedNode &&
                    (selectedNode.id === edge.source || selectedNode.id === edge.target);

                  return (
                    <g key={`edge-${edge.source}-${edge.target}`}>
                      {/* Connection line */}
                      <line
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={getEdgeColor(edge.type)}
                        strokeWidth={
                          isSelectedEdge
                            ? getEdgeWidth(edge.type) * 3
                            : isHighlighted
                              ? getEdgeWidth(edge.type) * 2
                              : getEdgeWidth(edge.type)
                        }
                        className="transition-all duration-300"
                        style={{
                          filter: isSelectedEdge
                            ? 'drop-shadow(0 0 4px rgba(129, 161, 193, 0.3))'
                            : 'none',
                        }}
                      />

                      {/* Hover glow layer */}
                      {isHighlighted && (
                        <line
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          stroke="rgba(129, 161, 193, 0.15)"
                          strokeWidth={12}
                          strokeLinecap="round"
                        />
                      )}

                      {/* Edge label (shown only on hover) */}
                      {isHighlighted && (
                        <text
                          x={(source.x + target.x) / 2}
                          y={(source.y + target.y) / 2 - 8}
                          textAnchor="middle"
                          fill="#808080"
                          fontSize="6"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {edge.type === 'environment' ? `env: ${edge.label}` : `type: ${edge.label}`}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* ── Data flow particles ──────────────────────────── */}
                {particles.map((p, i) => {
                  const endpoints = edgeEndpoints[p.edgeKey];
                  if (!endpoints) return null;

                  const pos = getPointOnEdge(endpoints.source, endpoints.target, p.progress);
                  const typeColor =
                    TYPE_COLORS[endpoints.source.type] || TYPE_COLORS.default;

                  return (
                    <circle
                      key={`particle-${i}`}
                      cx={pos.x}
                      cy={pos.y}
                      r={p.size}
                      fill={typeColor}
                      opacity={p.opacity}
                      style={{
                        filter: `drop-shadow(0 0 3px ${typeColor}40)`,
                      }}
                    />
                  );
                })}

                {/* ── Nodes ────────────────────────────────────────── */}
                {nodes.map((node) => {
                  const statusColor = getStatusColor(node.status);
                  const typeColor = getNodeTypeColor(node);
                  const isHovered = hoveredNode?.id === node.id;
                  const isSelected = selectedNode?.id === node.id;
                  const hasCritical = getNodeCriticalAlerts(node) > 0;
                  const hasAlerts = getNodeAlertCount(node) > 0;

                  return (
                    <g
                      key={node.id}
                      data-node-id={node.id}
                      onMouseEnter={(e) => handleNodeMouseEnter(e, node)}
                      onMouseLeave={handleNodeMouseLeave}
                      onMouseMove={handleNodeMouseMove}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeClick(node);
                      }}
                      style={{ cursor: 'pointer' }}
                      className="transition-opacity duration-200"
                    >
                      {/* Outer glow ring (pulse for critical) */}
                      {hasCritical && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={NODE_RADIUS + 8}
                          fill="none"
                          stroke="rgba(191, 97, 106, 0.4)"
                          strokeWidth={2}
                          className="animate-alert-pulse"
                        />
                      )}

                      {/* Selection ring */}
                      {isSelected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={NODE_RADIUS + 6}
                          fill="none"
                          stroke={typeColor}
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          opacity={0.6}
                        />
                      )}

                      {/* Hover ring */}
                      {isHovered && !isSelected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={NODE_RADIUS + 4}
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.1)"
                          strokeWidth={2}
                        />
                      )}

                      {/* Node shadow */}
                      <circle
                        cx={node.x + 2}
                        cy={node.y + 2}
                        r={NODE_RADIUS}
                        fill="rgba(0, 0, 0, 0.3)"
                      />

                      {/* Node background */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS}
                        fill="#181825"
                        stroke={statusColor.fill}
                        strokeWidth={2.5}
                        className="transition-all duration-300"
                        style={{
                          filter: isHovered
                            ? `drop-shadow(0 0 8px ${statusColor.glow})`
                            : `drop-shadow(0 0 4px ${statusColor.glow})`,
                        }}
                      />

                      {/* Type indicator ring */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS - 5}
                        fill="none"
                        stroke={typeColor}
                        strokeWidth={1}
                        opacity={0.3}
                      />

                      {/* Icon */}
                      <Server
                        x={node.x - 8}
                        y={node.y - 8}
                        width={16}
                        height={16}
                        color={typeColor}
                        opacity={0.8}
                      />

                      {/* Status dot */}
                      <circle
                        cx={node.x + NODE_RADIUS - 6}
                        cy={node.y - NODE_RADIUS + 6}
                        r={4}
                        fill={statusColor.fill}
                        stroke="#181825"
                        strokeWidth={1.5}
                      />

                      {/* Alert badge */}
                      {hasAlerts && (
                        <g>
                          <circle
                            cx={node.x + NODE_RADIUS - 2}
                            cy={node.y - NODE_RADIUS + 14}
                            r={6}
                            fill={hasCritical ? '#bf616a' : '#ebcb8b'}
                          />
                          <text
                            x={node.x + NODE_RADIUS - 2}
                            y={node.y - NODE_RADIUS + 15}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize="5"
                            fontWeight="bold"
                          >
                            {getNodeAlertCount(node)}
                          </text>
                        </g>
                      )}

                      {/* Server name label */}
                      <text
                        x={node.x}
                        y={node.y + NODE_RADIUS + 14}
                        textAnchor="middle"
                        fill={isHovered ? '#e0e0e0' : '#808080'}
                        fontSize={isHovered ? '7' : '6'}
                        fontFamily="Inter, sans-serif"
                        fontWeight={isHovered ? '600' : '400'}
                        className="transition-all duration-200 pointer-events-none"
                      >
                        {node.name.length > 16 ? node.name.slice(0, 14) + '...' : node.name}
                      </text>

                      {/* Host label (shown on hover) */}
                      {isHovered && (
                        <text
                          x={node.x}
                          y={node.y + NODE_RADIUS + 26}
                          textAnchor="middle"
                          fill="#606060"
                          fontSize="5"
                          fontFamily="JetBrains Mono, monospace"
                          className="pointer-events-none"
                        >
                          {node.host}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* ── Tooltip ─────────────────────────────────────────────── */}
          {hoveredNode && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: tooltipPos.x + 16,
                top: tooltipPos.y - 10,
                transform: 'translateY(-50%)',
              }}
            >
              <div className="bg-dark-800/95 backdrop-blur-sm border border-dark-600/50 rounded-lg p-3 shadow-xl min-w-[180px]">
                {/* Server name */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: getStatusColor(hoveredNode.status).fill,
                    }}
                  />
                  <span className="text-xs font-semibold text-white">{hoveredNode.name}</span>
                </div>

                {/* Host & ID */}
                <div className="text-[10px] text-gray-500 font-mono mb-2">
                  {hoveredNode.host} · {hoveredNode.id}
                </div>

                {/* Metrics */}
                {(() => {
                  const m = getNodeMetrics(hoveredNode);
                  return (
                    <div className="space-y-1.5 mb-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 text-gray-400">
                          <Cpu className="w-3 h-3" /> CPU
                        </span>
                        <span className="font-mono" style={{ color: m.cpu > 90 ? '#bf616a' : m.cpu > 75 ? '#ebcb8b' : '#a3be8c' }}>
                          {m.cpu.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 text-gray-400">
                          <MemoryStick className="w-3 h-3" /> Memory
                        </span>
                        <span className="font-mono" style={{ color: m.mem > 90 ? '#bf616a' : m.mem > 75 ? '#ebcb8b' : '#a3be8c' }}>
                          {m.mem.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 text-gray-400">
                          <HardDrive className="w-3 h-3" /> Disk
                        </span>
                        <span className="font-mono" style={{ color: m.disk > 90 ? '#bf616a' : m.disk > 75 ? '#ebcb8b' : '#a3be8c' }}>
                          {m.disk.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Status & Type */}
                <div className="flex items-center gap-2 pt-1.5 border-t border-dark-700/30 text-[10px]">
                  <span className="flex items-center gap-1 text-gray-500">
                    {hoveredNode.status === 'online' ? (
                      <Wifi className="w-3 h-3 text-success" />
                    ) : hoveredNode.status === 'offline' ? (
                      <WifiOff className="w-3 h-3 text-danger" />
                    ) : (
                      <Minus className="w-3 h-3 text-warning" />
                    )}
                    <span style={{ color: getStatusColor(hoveredNode.status).fill }}>
                      {getStatusColor(hoveredNode.status).label}
                    </span>
                  </span>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-500 capitalize">{hoveredNode.type}</span>
                  {hoveredNode.environment && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-500">{hoveredNode.environment}</span>
                    </>
                  )}
                </div>

                {/* Alert info */}
                {getNodeAlertCount(hoveredNode) > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-dark-700/30">
                    <AlertTriangle className={`w-3 h-3 ${getNodeCriticalAlerts(hoveredNode) > 0 ? 'text-danger' : 'text-warning'}`} />
                    <span className={`text-[10px] ${getNodeCriticalAlerts(hoveredNode) > 0 ? 'text-danger' : 'text-warning'}`}>
                      {getNodeAlertCount(hoveredNode)} active alert{getNodeAlertCount(hoveredNode) !== 1 ? 's' : ''}
                      {getNodeCriticalAlerts(hoveredNode) > 0 && ` (${getNodeCriticalAlerts(hoveredNode)} critical)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Selected node detail bar ────────────────────────────── */}
          {selectedNode && (
            <div className="absolute bottom-3 left-3 right-3 glass-card p-3 animate-slide-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: getStatusColor(selectedNode.status).fill,
                    }}
                  />
                  <div>
                    <span className="text-sm font-medium text-white">{selectedNode.name}</span>
                    <span className="text-[10px] text-gray-500 ml-2 font-mono">{selectedNode.host}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 capitalize px-2 py-0.5 rounded bg-dark-800">
                    {selectedNode.type}
                  </span>
                  <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded bg-dark-800">
                    {selectedNode.environment}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {(() => {
                    const m = getNodeMetrics(selectedNode);
                    return (
                      <>
                        <div className="flex items-center gap-1.5">
                          <Cpu className="w-3 h-3 text-accent-500" />
                          <span className="text-xs font-mono text-gray-300">{m.cpu.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MemoryStick className="w-3 h-3 text-warning" />
                          <span className="text-xs font-mono text-gray-300">{m.mem.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <HardDrive className="w-3 h-3 text-success" />
                          <span className="text-xs font-mono text-gray-300">{m.disk.toFixed(1)}%</span>
                        </div>
                      </>
                    );
                  })()}
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="p-1 rounded text-gray-500 hover:text-white hover:bg-dark-700 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar: Legend & Filters ────────────────────────────────── */}
      <div className="w-56 hidden xl:flex flex-col gap-4">
        <TopologyLegend
          activeFilters={activeFilters}
          onToggleFilter={handleToggleFilter}
          availableTags={availableTags}
        />

        {/* Info card */}
        <div className="glass-card p-3">
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Interactions
          </h4>
          <div className="space-y-1.5 text-[10px] text-gray-500">
            <p>• Hover nodes for metrics</p>
            <p>• Click to pin details</p>
            <p>• Drag nodes to rearrange</p>
            <p>• Scroll to zoom</p>
            <p>• Drag background to pan</p>
            <p>• Tag filters above</p>
          </div>
        </div>

        {/* Edge legend */}
        <div className="glass-card p-3">
          <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Connections
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-[2px] rounded" style={{ backgroundColor: EDGE_COLORS.environment }} />
              <span className="text-[10px] text-gray-500">Same environment</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-[2px] rounded" style={{ backgroundColor: EDGE_COLORS.type }} />
              <span className="text-[10px] text-gray-500">Same type</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-500/60" />
              <span className="text-[10px] text-gray-500">Data flow</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
