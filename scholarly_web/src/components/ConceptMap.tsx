'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
  Node,
  Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { X, FileText, Sparkles, AlertTriangle, Layers, BookOpen } from 'lucide-react';
import { usePaperContext } from '@/context/PaperContext';

// ──────────────────────────── TYPES ────────────────────────────
interface ConceptMapProps {
  activePaperId: number | null;
}

interface ChunkResult {
  page: number;
  content: string;
}

interface NodeData {
  label: string;
  conflict?: boolean;
}

// ──────────────────────────── CUSTOM NODES ────────────────────────────
const GlassNode = ({ data, selected }: NodeProps<Node<NodeData>>) => {
  const isConflict = data.conflict === true;

  const baseStyle = 'relative px-5 py-3 rounded-2xl backdrop-blur-xl border font-semibold text-sm text-center min-w-[140px] cursor-pointer transition-all duration-300 flex flex-col items-center gap-1.5 z-10';
  
  let dynamicStyle = '';
  let badge = null;

  if (data.node_type === 'purple') {
    dynamicStyle = selected
      ? 'text-white bg-purple-950/80 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.6)] scale-105'
      : 'text-purple-50 bg-purple-900/40 border-purple-500/70 shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:bg-purple-900/50 hover:scale-[1.03] animate-[pulse_3s_ease-in-out_infinite]';
    badge = (
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-purple-300 uppercase tracking-widest bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-500/40 shadow-inner">
        <AlertTriangle className="w-3 h-3 text-purple-400" /> Discredited
      </div>
    );
  } else if (data.node_type === 'yellow') {
    dynamicStyle = selected
      ? 'text-black bg-amber-400/90 border-[#F59E0B] shadow-[0_0_30px_rgba(245,158,11,0.6)] scale-105'
      : 'text-amber-100 bg-amber-900/40 border-[#F59E0B]/70 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:bg-amber-900/50 hover:scale-[1.03] animate-[pulse_3s_ease-in-out_infinite]';
    badge = (
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-300 uppercase tracking-widest bg-amber-950/60 px-2 py-0.5 rounded-md border border-[#F59E0B]/40 shadow-inner">
        <AlertTriangle className="w-3 h-3 text-amber-400" /> Variation
      </div>
    );
  } else if (data.node_type === 'red' || data.conflict) {
    dynamicStyle = selected
      ? 'text-white bg-red-950/80 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] scale-105'
      : 'text-red-50 bg-red-900/40 border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:bg-red-900/50 hover:scale-[1.03] animate-[pulse_3s_ease-in-out_infinite]';
    badge = (
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-red-300 uppercase tracking-widest bg-red-950/60 px-2 py-0.5 rounded-md border border-red-500/40 shadow-inner">
        <AlertTriangle className="w-3 h-3 text-red-400" /> Conflict
      </div>
    );
  } else {
    // Neutral
    dynamicStyle = selected
      ? 'text-white bg-gradient-to-br from-amber-500/30 to-amber-900/30 border-amber-500/80 shadow-[0_0_25px_rgba(245,158,11,0.4)] scale-105'
      : 'text-gray-100 bg-slate-900/50 border-white/10 hover:bg-slate-800/60 hover:border-amber-500/40 hover:scale-[1.03] hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]';
  }

  return (
    <div className={`${baseStyle} ${dynamicStyle}`}>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-none !w-4 !h-4 -mt-2" />
      <span className="tracking-wide">{data.label}</span>
      {badge}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-none !w-4 !h-4 -mb-2" />
    </div>
  );
};

const nodeTypes = { glassNode: GlassNode };

// ──────────────────────────── DAGRE AUTO-LAYOUT ────────────────────────────
const applyDagreLayout = (nodes: Node[], edges: Edge[], direction = 'TB'): { nodes: Node[], edges: Edge[] } => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 180;
  const nodeHeight = 80;

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 120,
    nodesep: 90,
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const processGraphData = (data: any) => {
  const rawNodes: Node[] = (data.nodes || []).map((n: any) => ({
    ...n,
    type: 'glassNode',
  }));

  // Build adjacency list for edge propagation
  const outgoingEdges: Record<string, Edge[]> = {};
  const rawEdges: Edge[] = (data.edges || []).map((e: any) => {
    const edge = { ...e, animated: true, style: { stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 2 } };
    if (!outgoingEdges[e.source]) outgoingEdges[e.source] = [];
    outgoingEdges[e.source].push(edge);
    return edge;
  });

  const processedEdges = new Map<string, Edge>();
  rawEdges.forEach(e => processedEdges.set(e.id, e));

  // Determine initial colored nodes (Interest Nodes)
  const interestNodes = new Set<string>();
  rawNodes.forEach(n => {
    if (n.data?.node_type === 'red' || n.data?.node_type === 'yellow' || n.data?.node_type === 'purple' || n.data?.conflict) {
      interestNodes.add(n.id);
    }
  });

  // BFS to propagate color up to depth 2
  const queue: { edgeId: string; depth: number; currentPolarity: string; baseColor: string }[] = [];

  rawEdges.forEach(edge => {
    const isSourceInterest = interestNodes.has(edge.source);
    const isTargetInterest = interestNodes.has(edge.target);
    
    // Condition: color if leads to or branches out from a colored node
    if (isSourceInterest || isTargetInterest) {
      const p = edge.data?.polarity || 'neutral';
      let color = 'rgba(255, 255, 255, 0.2)'; // Neutral Gray
      if (p === 'increase') color = 'rgba(16, 185, 129, 0.6)'; // Green
      else if (p === 'decrease') color = 'rgba(239, 68, 68, 0.6)'; // Red
      
      // But user requested: "unless something reverses polarity... branches are colored red as above"
      // Wait, let's use the polarity-based color for the immediate edges.
      // Actually, user said: "If an edge originates from a Red Node, color it Red... Propagate Red... Neutralize if flip"
      // Let's implement EXACTLY what they asked for the Red Conflict propagation:
      
      if (interestNodes.has(edge.source)) {
        const sourceNode = rawNodes.find(n => n.id === edge.source);
        if (sourceNode?.data?.node_type === 'red' || sourceNode?.data?.conflict) {
          color = 'rgba(239, 68, 68, 0.8)'; // Red
          queue.push({ edgeId: edge.id, depth: 1, currentPolarity: p, baseColor: color });
        }
      }
      
      const e = processedEdges.get(edge.id)!;
      e.style = { stroke: color, strokeWidth: 3 };
      e.markerEnd = { type: MarkerType.ArrowClosed, color: color };
      e.labelStyle = { fill: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 11 };
      e.labelBgStyle = { fill: 'rgba(15, 23, 42, 0.85)', stroke: color, strokeWidth: 1 };
      e.labelBgPadding = [6, 4];
      e.labelBgBorderRadius = 6;
    } else {
      // Keep Neutral Gray
      const e = processedEdges.get(edge.id)!;
      e.style = { stroke: 'rgba(255, 255, 255, 0.1)', strokeWidth: 1.5 };
      e.markerEnd = { type: MarkerType.ArrowClosed, color: 'rgba(255, 255, 255, 0.1)' };
      e.labelStyle = { fill: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 10 };
      e.labelBgStyle = { fill: 'rgba(15, 23, 42, 0.5)', stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 };
      e.labelBgPadding = [4, 2];
      e.labelBgBorderRadius = 4;
    }
  });

  // Process the propagation queue
  while (queue.length > 0) {
    const { edgeId, depth, currentPolarity, baseColor } = queue.shift()!;
    if (depth >= 2) continue; // Recursive Depth Limit = 2 jumps

    const currentEdge = processedEdges.get(edgeId)!;
    const downstreamEdges = outgoingEdges[currentEdge.target] || [];

    for (const dEdge of downstreamEdges) {
      const dPolarity = dEdge.data?.polarity || 'neutral';
      
      // Neutralization Rule: If flip
      if ((currentPolarity === 'decrease' && dPolarity === 'decrease') || (currentPolarity === 'increase' && dPolarity === 'decrease')) {
        // Flip detected, Neutralize
        const e = processedEdges.get(dEdge.id)!;
        e.style = { ...e.style, stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 1.5 };
        e.markerEnd = { type: MarkerType.ArrowClosed, color: 'rgba(255, 255, 255, 0.2)' };
        // We stop pushing to queue for this sub-branch
      } else {
        // Propagate baseColor
        const e = processedEdges.get(dEdge.id)!;
        e.style = { ...e.style, stroke: baseColor, strokeWidth: 3 };
        e.markerEnd = { type: MarkerType.ArrowClosed, color: baseColor };
        e.labelStyle = { fill: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 11 };
        e.labelBgStyle = { fill: 'rgba(15, 23, 42, 0.85)', stroke: baseColor, strokeWidth: 1 };
        e.labelBgPadding = [6, 4];
        e.labelBgBorderRadius = 6;
        
        queue.push({ edgeId: dEdge.id, depth: depth + 1, currentPolarity: dPolarity, baseColor });
      }
    }
  }

  return applyDagreLayout(rawNodes, Array.from(processedEdges.values()));
};

// ──────────────────────────── LOADERS ────────────────────────────
const ModernLoader = () => (
  <div className="flex flex-col items-center justify-center p-8 h-full w-full">
    <div className="relative flex items-center justify-center w-24 h-24 mb-6">
      <div className="absolute inset-0 border-t-2 border-amber-500/80 border-solid rounded-full animate-spin"></div>
      <div className="absolute inset-2 border-r-2 border-amber-400/50 border-solid rounded-full animate-spin animation-delay-200"></div>
      <Sparkles className="w-6 h-6 text-amber-500 animate-pulse" />
    </div>
    <h3 className="text-amber-500 font-medium tracking-widest text-sm uppercase">Synthesizing Network</h3>
    <p className="text-gray-500 text-xs mt-2">Extracting high-dimensional concept vectors</p>
  </div>
);

const DotsLoader = () => (
  <div className="flex items-center justify-center gap-1.5 py-10">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="w-2 h-2 rounded-full bg-amber-500"
        style={{ animation: `bounce 1.4s infinite ease-in-out both`, animationDelay: `${i * 0.16}s` }}
      />
    ))}
  </div>
);

// ──────────────────────────── MAIN COMPONENT ────────────────────────────
export default function ConceptMap({ activePaperId }: ConceptMapProps) {
  const { prefetchedMapData, clearPrefetchedMap, papers } = usePaperContext();
  const prefetchRef = useRef(prefetchedMapData);
  prefetchRef.current = prefetchedMapData;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [compareToId, setCompareToId] = useState<string>('');
  
  // Panel State
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  const [panelChunks, setPanelChunks] = useState<ChunkResult[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);

  const closePanel = useCallback(() => {
    setPanelVisible(false);
    setTimeout(() => {
      setSelectedNodeData(null);
      setPanelChunks([]);
    }, 300);
  }, []);

  const loadGraph = useCallback(async (paperId: number, compareId?: string, mYear?: number) => {
    setLoading(true);
    setError(null);
    closePanel();
    
    try {
      let url = `http://127.0.0.1:8000/api/concept-map/${paperId}/`;
      const params = new URLSearchParams();
      if (compareId) params.append('compare_to', compareId);
      const query = params.toString();
      if (query) url += `?${query}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`API Error (${res.status}): ${errBody}`);
      }
      const data = await res.json();
      const { nodes: n, edges: e } = processGraphData(data);
      setNodes(n);
      setEdges(e);
    } catch (err: any) {
      console.error('loadGraph error:', err);
      setError(err.message || 'Failed to construct concept network.');
    } finally {
      setLoading(false);
    }
  }, [closePanel, setNodes, setEdges]);

  useEffect(() => {
    if (!activePaperId) {
      setNodes([]);
      setEdges([]);
      setError(null);
      closePanel();
      return;
    }
    
    const handler = setTimeout(() => {
      loadGraph(activePaperId, compareToId);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(handler);
  }, [activePaperId, compareToId, loadGraph, setNodes, setEdges, closePanel]);

  const handleNodeClick = useCallback(async (_: React.MouseEvent, node: Node) => {
    if (!activePaperId) return;
    const data = node.data as NodeData;
    if (!data.label) return;

    setSelectedNodeData(data);
    setPanelChunks([]);
    setPanelLoading(true);
    setPanelVisible(true);

    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/concept-chunks/${activePaperId}/?concept=${encodeURIComponent(data.label)}`
      );
      if (!res.ok) throw new Error('Evidence extraction failed');
      const json: ChunkResult[] = await res.json();
      setPanelChunks(json);
    } catch (err) {
      console.error('Evidence fetch error:', err);
      setPanelChunks([]);
    } finally {
      setPanelLoading(false);
    }
  }, [activePaperId]);

  if (!activePaperId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-4">
        <Layers className="w-12 h-12 opacity-20" />
        <p className="text-sm tracking-wide">Select a paper from the library to visualize its knowledge graph.</p>
      </div>
    );
  }

  if (loading) return <ModernLoader />;

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-6 text-center max-w-md backdrop-blur-md">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3 opacity-80" />
          <h3 className="text-red-400 font-semibold mb-2">Synthesis Failed</h3>
          <p className="text-red-300/70 text-xs font-mono break-words">{error}</p>
        </div>
      </div>
    );
  }


  return (
    <div className="w-full h-full relative overflow-hidden bg-transparent">
      {/* ──────────────── COMPARISON SELECTOR ──────────────── */}
      <div className="absolute top-4 left-4 z-40 flex flex-col gap-2">
        <div className="relative">
          <select
            value={compareToId}
            onChange={(e) => setCompareToId(e.target.value)}
            className="bg-slate-900/90 border border-[#F59E0B]/40 text-amber-400 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-[#F59E0B] shadow-[0_4px_15px_rgba(245,158,11,0.15)] backdrop-blur-xl cursor-pointer hover:bg-slate-800/90 transition-all appearance-none pr-8"
          >
            <option value="">Compare against</option>
            {papers.filter((p: any) => p.id !== activePaperId).map((p: any) => (
              <option key={p.id} value={p.id.toString()}>Compare vs: {p.title || p.name}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-amber-500">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>
        
        {/* Comparison Banner */}
        {compareToId && (
          <div className="bg-amber-500/20 border border-amber-500/50 text-amber-400 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.2)] backdrop-blur-md animate-fade-in flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            Comparing Nodes vs Target Document
          </div>
        )}
      </div>

      {/* ──────────────── GRAPH CANVAS ──────────────── */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={closePanel}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="[&_.react-flow__controls]:bg-slate-900/80 [&_.react-flow__controls]:border-[#F59E0B] [&_.react-flow__controls]:border [&_.react-flow__controls]:backdrop-blur-md [&_.react-flow__controls_button]:border-white/5 [&_.react-flow__controls_button]:bg-transparent [&_.react-flow__controls_button]:fill-[#F59E0B] hover:[&_.react-flow__controls_button]:fill-amber-400"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="rgba(255,255,255,0.05)" />
        <Controls showInteractive={false} />
      </ReactFlow>


      {/* ──────────────── EVIDENCE PANEL ──────────────── */}
      <div
        className={`absolute top-4 right-4 bottom-4 w-[400px] max-w-[calc(100vw-2rem)] z-50 flex flex-col rounded-3xl backdrop-blur-2xl bg-slate-950/80 border border-white/10 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
          panelVisible ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 shrink-0 bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3 items-center min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-900/20 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
                <BookOpen className="w-5 h-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mb-0.5">Concept Origin</p>
                <h3 className="text-slate-100 font-semibold text-base truncate">{selectedNodeData?.label}</h3>
              </div>
            </div>
            <button
              onClick={closePanel}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors shrink-0 border border-white/5 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {selectedNodeData?.node_type === 'purple' && (
            <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 flex items-start gap-3 shadow-inner">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-purple-400 text-xs font-bold tracking-wider uppercase mb-1">Discredited Evidence</h4>
                <p className="text-purple-200/60 text-[11px] leading-relaxed">
                  The methodology supporting this concept triggered an ethical heuristic alert. Exercise caution.
                </p>
              </div>
            </div>
          )}
          
          {(selectedNodeData?.node_type === 'red' || selectedNodeData?.conflict) && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 shadow-inner">
              <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              </div>
              <div>
                <h4 className="text-red-400 text-xs font-bold tracking-wider uppercase mb-1">Conflicting Evidence</h4>
                <p className="text-red-200/60 text-[11px] leading-relaxed">
                  This concept has contradictory polarities reported across compared papers. Review carefully.
                </p>
              </div>
            </div>
          )}

          {selectedNodeData?.node_type === 'yellow' && (
            <div className="bg-amber-950/40 border border-[#F59E0B]/30 rounded-2xl p-4 flex items-start gap-3 shadow-inner">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-[#F59E0B]/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <h4 className="text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">Parameter Variation</h4>
                <p className="text-amber-200/60 text-[11px] leading-relaxed">
                  This concept overlaps with the comparison target but features a numerical delta or nuanced variation rather than a direct contradiction.
                </p>
              </div>
            </div>
          )}
          
          {panelLoading ? (
            <DotsLoader />
          ) : panelChunks.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">No raw text citations available.</div>
          ) : (
            <div className="space-y-3">
              {panelChunks.map((chunk, idx) => (
                <div key={idx} className="rounded-2xl bg-white/[0.03] border border-white/[0.05] p-4 hover:bg-white/[0.05] hover:border-white/[0.08] transition-colors group">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-bold tracking-widest uppercase border border-amber-500/20">
                      <FileText className="w-3 h-3" />
                      Page {chunk.page}
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs leading-loose font-serif group-hover:text-slate-200 transition-colors">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
