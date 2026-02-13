import { useEffect, useState, useCallback, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { api } from '../api/client';
import { Loader2, Network, Maximize2, Filter, X } from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  group: string;
  val?: number;
  desc?: string;
  details?: Record<string, unknown>;
  x?: number;
  y?: number;
  fx?: number | undefined;
  fy?: number | undefined;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const GROUP_COLORS: Record<string, string> = {
  core: '#ef4444',
  agent: '#3b82f6',
  tool: '#22c55e',
  intelligence: '#f59e0b',
  skill: '#a855f7',
};

const GROUP_LABELS: Record<string, string> = {
  core: 'Engine',
  agent: 'Agents',
  tool: 'Tools',
  intelligence: 'Intelligence',
  skill: 'Skills',
};

// Shape drawing helpers per group
function drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const w = r * 1.6;
  const h = r * 1.2;
  const rad = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(x - w + rad, y - h);
  ctx.lineTo(x + w - rad, y - h);
  ctx.arcTo(x + w, y - h, x + w, y - h + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x - w + rad, y + h);
  ctx.arcTo(x - w, y + h, x - w, y + h - rad, rad);
  ctx.lineTo(x - w, y - h + rad);
  ctx.arcTo(x - w, y - h, x - w + rad, y - h, rad);
  ctx.closePath();
}

export default function Graph() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [popup, setPopup] = useState<GraphNode | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(['core', 'agent', 'tool', 'intelligence', 'skill']),
  );
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const graphRef = useRef<any>(null);
  const hoveredRef = useRef<string | null>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  useEffect(() => { loadGraph(); }, []);

  // Callback ref to attach ResizeObserver when the container mounts
  const containerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    // Disconnect previous observer
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    containerRef.current = el;
    if (!el) return;
    // Measure immediately
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    }
    // Observe for future resizes
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const loadGraph = async () => {
    try {
      const res = await api.graphData();
      setData(res);
    } catch {
      setData({ nodes: [], links: [] });
    }
    setLoading(false);
  };

  const toggleFilter = (group: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filteredData = data
    ? {
        nodes: data.nodes.filter(n => activeFilters.has(n.group)),
        links: data.links.filter(l => {
          const srcId = typeof l.source === 'string' ? l.source : l.source.id;
          const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
          const srcNode = data.nodes.find(n => n.id === srcId);
          const tgtNode = data.nodes.find(n => n.id === tgtId);
          return srcNode && tgtNode && activeFilters.has(srcNode.group) && activeFilters.has(tgtNode.group);
        }),
      }
    : { nodes: [], links: [] };

  // Get connected node IDs for highlighting
  const getConnectedIds = useCallback(
    (nodeId: string): Set<string> => {
      const ids = new Set<string>();
      if (!data) return ids;
      for (const l of data.links) {
        const srcId = typeof l.source === 'string' ? l.source : l.source.id;
        const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
        if (srcId === nodeId) ids.add(tgtId);
        if (tgtId === nodeId) ids.add(srcId);
      }
      return ids;
    },
    [data],
  );

  const handleNodeClick = useCallback((node: GraphNode) => {
    const now = Date.now();
    const last = lastClickRef.current;

    // Detect double-click (two clicks on same node within 400ms)
    if (last && last.id === node.id && now - last.time < 400) {
      lastClickRef.current = null;
      setPopup(node);
      return;
    }

    lastClickRef.current = { id: node.id, time: now };

    // Single click — select & zoom
    setSelected(node);
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 600);
      graphRef.current.zoom(2.5, 600);
    }
  }, []);

  const handleCenter = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 60);
    }
  };

  // Unlock all pinned nodes
  const handleUnlockAll = () => {
    if (!data) return;
    for (const n of data.nodes) {
      (n as any).fx = undefined;
      (n as any).fy = undefined;
    }
    graphRef.current?.d3ReheatSimulation();
  };

  // Node drag handlers — pin nodes where they're dropped
  const handleNodeDragEnd = useCallback((node: any) => {
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  // Custom node rendering — different shapes per group, glow, gradients
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (node.x == null || node.y == null) return;
      const label: string = node.name;
      const baseR = Math.sqrt(node.val || 2) * 4;
      const r = node.group === 'core' ? baseR * 1.3 : baseR;
      const color = GROUP_COLORS[node.group] || '#888';
      const isSelected = selected?.id === node.id;
      const isHovered = hoveredRef.current === node.id;
      const highlight = isSelected || isHovered;

      const connectedIds = selected ? getConnectedIds(selected.id) : new Set<string>();
      const isConnected = selected ? connectedIds.has(node.id) || selected.id === node.id : true;
      const dimmed = selected && !isConnected;

      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.15;

      // Outer glow
      if (highlight) {
        const glow = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, r * 2.5);
        glow.addColorStop(0, color + '50');
        glow.addColorStop(1, color + '00');
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Ring for pinned nodes
      if (node.fx != null) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff30';
        ctx.lineWidth = 1 / globalScale;
        ctx.setLineDash([3 / globalScale, 3 / globalScale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw shape based on group
      const gradient = ctx.createRadialGradient(
        node.x - r * 0.3, node.y - r * 0.3, 0,
        node.x, node.y, r * 1.2,
      );
      gradient.addColorStop(0, color + 'ff');
      gradient.addColorStop(1, color + '88');

      if (node.group === 'core') {
        // Core = double ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.65, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff90';
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      } else if (node.group === 'agent') {
        // Agent = hexagon
        drawHexagon(ctx, node.x, node.y, r);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = highlight ? '#fff' : color + '80';
        ctx.lineWidth = (highlight ? 2 : 0.8) / globalScale;
        ctx.stroke();
      } else if (node.group === 'intelligence') {
        // Intelligence = diamond
        drawDiamond(ctx, node.x, node.y, r);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = highlight ? '#fff' : color + '80';
        ctx.lineWidth = (highlight ? 2 : 0.8) / globalScale;
        ctx.stroke();
      } else if (node.group === 'skill') {
        // Skill = rounded rectangle
        drawRoundedRect(ctx, node.x, node.y, r);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = highlight ? '#fff' : color + '80';
        ctx.lineWidth = (highlight ? 2 : 0.8) / globalScale;
        ctx.stroke();
      } else {
        // Tool = circle with dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = highlight ? '#fff' : color + '60';
        ctx.lineWidth = (highlight ? 1.5 : 0.5) / globalScale;
        ctx.stroke();
        // Inner dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff50';
        ctx.fill();
      }

      // Label
      const fontSize = Math.max(11 / globalScale, 2);
      if (globalScale > 0.6 || highlight || node.group === 'core') {
        ctx.font = `${highlight ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Text shadow
        ctx.fillStyle = '#000000';
        ctx.fillText(label, node.x + 0.5 / globalScale, node.y + r + 3 + 0.5 / globalScale);
        ctx.fillStyle = dimmed ? '#666' : '#e5e7eb';
        ctx.fillText(label, node.x, node.y + r + 3);
      }

      ctx.restore();
    },
    [selected, getConnectedIds],
  );

  // Custom link rendering — curved, colored, animated
  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source;
      const tgt = link.target;
      if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) return;

      const connectedIds = selected ? getConnectedIds(selected.id) : null;
      const isHighlighted =
        selected &&
        ((src.id === selected.id && connectedIds?.has(tgt.id)) ||
          (tgt.id === selected.id && connectedIds?.has(src.id)));
      const dimmed = selected && !isHighlighted;

      ctx.save();

      // Curve the line slightly
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const offset = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.08, 15);
      const cx = mx + (-dy / Math.sqrt(dx * dx + dy * dy || 1)) * offset;
      const cy = my + (dx / Math.sqrt(dx * dx + dy * dy || 1)) * offset;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y);

      const srcColor = GROUP_COLORS[src.group] || '#888';
      const tgtColor = GROUP_COLORS[tgt.group] || '#888';
      if (dimmed) {
        ctx.strokeStyle = '#ffffff08';
        ctx.lineWidth = 0.3 / globalScale;
      } else if (isHighlighted) {
        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0, srcColor + 'cc');
        grad.addColorStop(1, tgtColor + 'cc');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5 / globalScale;
      } else {
        // Gradient from source to target color — visible on dark bg
        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0, srcColor + '60');
        grad.addColorStop(1, tgtColor + '60');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2 / globalScale;
      }

      ctx.stroke();

      // Arrow head for highlighted links
      if (isHighlighted) {
        const angle = Math.atan2(tgt.y - cy, tgt.x - cx);
        const tgtR = Math.sqrt(tgt.val || 2) * 4 + 4;
        const ax = tgt.x - Math.cos(angle) * tgtR;
        const ay = tgt.y - Math.sin(angle) * tgtR;
        const arrowLen = 6 / globalScale;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
        ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = (GROUP_COLORS[tgt.group] || '#888') + 'cc';
        ctx.fill();
      }

      ctx.restore();
    },
    [selected, getConnectedIds],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const connectionCount = (nodeId: string) => {
    if (!data) return 0;
    return data.links.filter(l => {
      const srcId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      const tgtId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      return srcId === nodeId || tgtId === nodeId;
    }).length;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/50 bg-dark-900/80">
        <div className="flex items-center gap-3">
          <Network className="w-6 h-6 text-primary-500" />
          <h1 className="text-xl font-bold">System Graph</h1>
          <span className="text-xs text-gray-500 bg-dark-800 px-2 py-0.5 rounded-full">
            {filteredData.nodes.length} nodes / {filteredData.links.length} links
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2">
            <Filter className="w-3.5 h-3.5 text-gray-600 mr-1" />
            {Object.entries(GROUP_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                  activeFilters.has(key)
                    ? 'text-white border-transparent shadow-sm'
                    : 'text-gray-600 bg-transparent border-gray-700 opacity-40 hover:opacity-70'
                }`}
                style={activeFilters.has(key) ? { backgroundColor: GROUP_COLORS[key] + 'cc' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleUnlockAll}
            className="px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-gray-400 text-[11px] transition-colors"
            title="Unlock all pinned nodes"
          >
            Unlock All
          </button>
          <button
            onClick={handleCenter}
            className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-gray-400 transition-colors"
            title="Fit to view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph — fill all remaining space */}
      <div ref={containerCallbackRef} className="flex-1 relative min-h-0">
        {dimensions.width > 0 && dimensions.height > 0 && <ForceGraph2D
          ref={graphRef}
          graphData={filteredData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={nodeCanvasObject}
          linkCanvasObject={linkCanvasObject}
          onNodeClick={handleNodeClick}
          onNodeDragEnd={handleNodeDragEnd}
          onBackgroundClick={() => { setSelected(null); }}
          cooldownTicks={120}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          backgroundColor="#0a0a0f"
          enableNodeDrag={true}
          enableZoomInteraction={true}
          onNodeHover={(node: any) => { hoveredRef.current = node?.id ?? null; }}
          nodeLabel=""
        />}

        {/* Double-click hint */}
        {selected && !popup && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-[11px] text-gray-600 bg-dark-900/80 px-3 py-1 rounded-full border border-gray-800">
            Double-click node for details
          </div>
        )}

        {/* Selected node info panel (bottom-left) */}
        {selected && !popup && (
          <div className="absolute bottom-4 left-4 max-w-xs p-4 bg-dark-900/95 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: GROUP_COLORS[selected.group], boxShadow: `0 0 8px ${GROUP_COLORS[selected.group]}60` }} />
              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{GROUP_LABELS[selected.group]}</span>
            </div>
            <h3 className="text-base font-bold text-white">{selected.name}</h3>
            {selected.desc && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{selected.desc}</p>}
            <div className="mt-2 text-xs text-gray-500">
              <span className="text-gray-300 font-semibold">{connectionCount(selected.id)}</span> connections
            </div>
          </div>
        )}

        {/* Full popup modal on double-click */}
        {popup && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm" onClick={() => setPopup(null)}>
            <div className="w-full max-w-md p-6 bg-dark-900 border border-gray-700/50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full shadow-lg" style={{ backgroundColor: GROUP_COLORS[popup.group], boxShadow: `0 0 12px ${GROUP_COLORS[popup.group]}80` }} />
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{GROUP_LABELS[popup.group]}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{popup.name}</h2>
                  <p className="text-xs text-gray-600 font-mono mt-0.5">{popup.id}</p>
                </div>
                <button onClick={() => setPopup(null)} className="p-1.5 rounded-lg hover:bg-dark-800 text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Description */}
              {popup.desc && (
                <p className="text-sm text-gray-300 leading-relaxed mb-4">{popup.desc}</p>
              )}

              {/* Details */}
              {popup.details && (
                <div className="space-y-3">
                  {Object.entries(popup.details).map(([key, val]) => (
                    <div key={key}>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{key}</span>
                      {Array.isArray(val) ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(val as string[]).map(v => (
                            <span key={v} className="px-2 py-0.5 text-xs rounded-md bg-dark-800 border border-gray-700/50 text-gray-300 font-mono">
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-300 font-mono mt-0.5">{String(val)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Connection count */}
              <div className="mt-4 pt-3 border-t border-gray-800">
                <span className="text-xs text-gray-500">
                  <span className="text-white font-semibold">{connectionCount(popup.id)}</span> connections in the system
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 right-3 p-3 bg-dark-900/90 backdrop-blur-xl border border-gray-800/50 rounded-xl">
          <p className="text-[9px] uppercase tracking-widest text-gray-600 mb-2 font-bold">Legend</p>
          {Object.entries(GROUP_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 py-0.5">
              <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: GROUP_COLORS[key], boxShadow: `0 0 4px ${GROUP_COLORS[key]}40` }} />
              <span className="text-[11px] text-gray-400">{label}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-800/50 text-[10px] text-gray-600 space-y-0.5">
            <div>Click = select</div>
            <div>Dbl-click = details</div>
            <div>Drag = pin node</div>
          </div>
        </div>
      </div>
    </div>
  );
}
