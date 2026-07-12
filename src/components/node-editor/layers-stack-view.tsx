"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
import { Node } from "@xyflow/react";
import { Copy, Trash2, Plus, Boxes, Layers } from "lucide-react";
import { NodeData } from "@/types/nodes";
import { useNodeEditorStore } from "./use-node-editor-store";
import FederationScene from "./federation-scene";
import { Camera, DEFAULT_CAMERA, VIEW_W, VIEW_H, project, clampPitch, clampZoom } from "@/lib/stack-3d-math";
import { MUTED_COLORS } from "@/lib/node-styles";

// True-3D dimension stack: layers are horizontal planes in world space that
// the camera orbits around. Zooming far out transitions to the Federation
// level, where each hub renders as a cube linked by federation channels.

const PLANE_W = 860; // world-space plane width (x)
const PLANE_D = 520; // world-space plane depth (z)
const LAYER_GAP = 112; // vertical distance between layers
const PULL_X = 300; // selected layer slides out of the stack along +x

const TRIGGER_HANDLES = new Set(["triggerOut", "outTrigger", "onTrue", "onFalse", "spike"]);
const isTriggerHandle = (h?: string | null) =>
  !!h && (h.endsWith("Trigger") || TRIGGER_HANDLES.has(h));

function categoryColor(type?: string): string {
  if (!type) return MUTED_COLORS.teal;
  if (["triggerInput", "constNum", "constBool", "constString"].includes(type)) return MUTED_COLORS.blue;
  if (["ifElseTrigger", "condValue", "delayNode", "counterNode", "forLoopNode", "whileLoopNode"].includes(type)) return MUTED_COLORS.purple;
  if (["compareNode", "expressionNode", "randomNode", "mathNode", "mathFunctionNode"].includes(type)) return MUTED_COLORS.amber;
  if (["filterNode", "stringOpNode", "replaceTextNode"].includes(type)) return MUTED_COLORS.emerald;
  if (["loggerNode", "textOutputNode"].includes(type)) return MUTED_COLORS.rose;
  if (type === "pythonScript" || type.startsWith("ollama")) return MUTED_COLORS.violet;
  if (["thresholdNeuron", "maxSelectorNode", "synapseNode", "leakyIntegrateFire"].includes(type)) return MUTED_COLORS.indigo;
  if (["imageInputGrid", "denseLayer", "outputLayerNode"].includes(type)) return MUTED_COLORS.cyan;
  return MUTED_COLORS.teal;
}

function nodeCenter(n: Node<NodeData>): { x: number; y: number } {
  const w = (n as any).measured?.width ?? 220;
  const h = (n as any).measured?.height ?? 140;
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
}

export default function LayersStackView() {
  const layers = useNodeEditorStore((s) => s.layers);
  const activeLayerId = useNodeEditorStore((s) => s.activeLayerId);
  const selectLayer = useNodeEditorStore((s) => s.selectLayer);
  const duplicateLayer = useNodeEditorStore((s) => s.duplicateLayer);
  const deleteLayer = useNodeEditorStore((s) => s.deleteLayer);
  const addLayer = useNodeEditorStore((s) => s.addLayer);
  const renameLayer = useNodeEditorStore((s) => s.renameLayer);
  const setIsLayersViewOpen = useNodeEditorStore((s) => s.setIsLayersViewOpen);
  const hubs = useNodeEditorStore((s) => s.hubs);
  const activeHubId = useNodeEditorStore((s) => s.activeHubId);
  const selectHub = useNodeEditorStore((s) => s.selectHub);
  const addHub = useNodeEditorStore((s) => s.addHub);
  const duplicateHub = useNodeEditorStore((s) => s.duplicateHub);
  const deleteHub = useNodeEditorStore((s) => s.deleteHub);
  const renameHub = useNodeEditorStore((s) => s.renameHub);

  const [mode, setMode] = useState<"stack" | "federation">("stack");
  const [cam, setCam] = useState<Camera>(DEFAULT_CAMERA);
  const dragRef = useRef<{
    x: number; y: number; cam: Camera; pan: boolean; moved: boolean;
  } | null>(null);

  // Shared coordinate frame across all layers so bridged clones align vertically.
  const bbox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of layers)
      for (const n of l.nodes) {
        const c = nodeCenter(n);
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
      }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
    const padX = Math.max((maxX - minX) * 0.14, 80);
    const padY = Math.max((maxY - minY) * 0.14, 80);
    return { minX: minX - padX, minY: minY - padY, spanX: maxX - minX + padX * 2, spanY: maxY - minY + padY * 2 };
  }, [layers]);

  // World position of a node on a given layer plane.
  const worldOf = useCallback(
    (n: Node<NodeData>, layerIdx: number, xOff: number) => {
      const c = nodeCenter(n);
      const u = (c.x - bbox.minX) / bbox.spanX;
      const v = (c.y - bbox.minY) / bbox.spanY;
      const yWorld = ((layers.length - 1) / 2 - layerIdx) * LAYER_GAP;
      return { x: (u - 0.5) * PLANE_W + xOff, y: yWorld, z: (v - 0.5) * PLANE_D };
    },
    [bbox, layers.length]
  );

  const layerMeta = useMemo(
    () =>
      layers.map((l, i) => {
        const selected = l.id === activeLayerId;
        const xOff = selected ? PULL_X : 0;
        const yWorld = ((layers.length - 1) / 2 - i) * LAYER_GAP;
        return { layer: l, idx: i, selected, xOff, yWorld };
      }),
    [layers, activeLayerId]
  );

  // Painter's algorithm on plane centers.
  const drawOrder = useMemo(
    () =>
      [...layerMeta].sort(
        (a, b) => project(a.xOff, a.yWorld, 0, cam).depth - project(b.xOff, b.yWorld, 0, cam).depth
      ).reverse(),
    [layerMeta, cam]
  );

  const bridges = useMemo(() => {
    const groups = new Map<string, { li: number; n: Node<NodeData> }[]>();
    layers.forEach((l, li) => {
      for (const n of l.nodes) {
        const sid = n.data.config?.sharedId;
        if (sid) {
          if (!groups.has(sid)) groups.set(sid, []);
          groups.get(sid)!.push({ li, n });
        }
      }
    });
    return [...groups.values()].filter((g) => g.length > 1).map((g) => [...g].sort((a, b) => a.li - b.li));
  }, [layers]);

  const guarded = (fn: () => void) => {
    if (dragRef.current?.moved) return;
    fn();
  };

  const onWheel = (e: React.WheelEvent) => {
    const nz = clampZoom(cam.zoom * (e.deltaY < 0 ? 1.08 : 0.92));
    if (mode === "stack" && nz <= 0.42) {
      setMode("federation");
      setCam((c) => ({ ...c, zoom: 1, panX: 0, panY: 0 }));
    } else if (mode === "federation" && nz >= 2.1) {
      setMode("stack");
      setCam((c) => ({ ...c, zoom: 1, panX: 0, panY: 0 }));
    } else {
      setCam((c) => ({ ...c, zoom: nz }));
    }
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeHub = hubs.find((h) => h.id === activeHubId);

  return (
    <div className="relative flex-1 w-full overflow-hidden">
      {/* Control strip */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/60 rounded-lg px-3 py-1.5">
        {mode === "stack" ? (
          <>
            <span className="text-[10px] font-bold text-[#AC9BC4] uppercase tracking-wide" title={activeHubId}>
              {activeHub?.name}
            </span>
            <span className="text-zinc-700">/</span>
            <input
              value={activeLayer?.name ?? ""}
              onChange={(e) => renameLayer(activeLayerId, e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#9AC0C4] outline-none w-32 border-b border-transparent focus:border-[#7FAAB0]/50"
              title={`Rename dimension (id: ${activeLayerId})`}
            />
            <span className="text-[10px] text-zinc-500">
              {activeLayer?.nodes.length ?? 0} nodes · {activeLayer?.edges.length ?? 0} links · {bridges.length} bridges
            </span>
            <div className="w-px h-4 bg-zinc-800" />
            <button onClick={() => activeLayer && duplicateLayer(activeLayer.id)} className="p-1 rounded text-zinc-400 hover:text-[#9AC0C4] hover:bg-zinc-800/70 transition" title="Duplicate this dimension">
              <Copy size={13} />
            </button>
            <button onClick={() => activeLayer && deleteLayer(activeLayer.id)} disabled={layers.length <= 1} className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800/70 disabled:opacity-30 transition" title="Collapse this dimension">
              <Trash2 size={13} />
            </button>
            <button onClick={addLayer} className="p-1 rounded text-zinc-400 hover:text-[#9AC0C4] hover:bg-zinc-800/70 transition" title="New dimension">
              <Plus size={13} />
            </button>
            <div className="w-px h-4 bg-zinc-800" />
            <button onClick={() => setMode("federation")} className="flex items-center gap-1 p-1 px-1.5 rounded text-[#AD8BB0] hover:text-[#C4A8C6] hover:bg-zinc-800/70 transition text-[10px] font-bold" title="Zoom out to the Federation level">
              <Boxes size={13} /> Federation
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] font-bold text-[#C4A8C6] uppercase tracking-wide">Federation</span>
            <span className="text-zinc-700">/</span>
            <input
              value={activeHub?.name ?? ""}
              onChange={(e) => renameHub(activeHubId, e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#9AC0C4] outline-none w-32 border-b border-transparent focus:border-[#7FAAB0]/50"
              title={`Rename hub (id: ${activeHubId})`}
            />
            <span className="text-[10px] text-zinc-500">{hubs.length} hubs</span>
            <div className="w-px h-4 bg-zinc-800" />
            <button onClick={addHub} className="p-1 rounded text-zinc-400 hover:text-[#9AC0C4] hover:bg-zinc-800/70 transition" title="New blank hub">
              <Plus size={13} />
            </button>
            <button onClick={() => duplicateHub(activeHubId)} className="p-1 rounded text-zinc-400 hover:text-[#9AC0C4] hover:bg-zinc-800/70 transition" title="Duplicate this hub">
              <Copy size={13} />
            </button>
            <button onClick={() => deleteHub(activeHubId)} disabled={hubs.length <= 1} className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800/70 disabled:opacity-30 transition" title="Delete this hub">
              <Trash2 size={13} />
            </button>
            <div className="w-px h-4 bg-zinc-800" />
            <button onClick={() => setMode("stack")} className="flex items-center gap-1 p-1 px-1.5 rounded text-[#7FAAB0] hover:text-[#9AC0C4] hover:bg-zinc-800/70 transition text-[10px] font-bold" title="Dive into the selected hub">
              <Layers size={13} /> Stack
            </button>
          </>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, cam, pan: e.shiftKey, moved: false };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (!d.moved) return;
          if (d.pan) {
            setCam({ ...d.cam, panX: d.cam.panX + dx, panY: d.cam.panY + dy });
          } else {
            setCam({ ...d.cam, yaw: d.cam.yaw + dx * 0.005, pitch: clampPitch(d.cam.pitch + dy * 0.004) });
          }
        }}
        onPointerUp={() => { setTimeout(() => (dragRef.current = null), 0); }}
        onPointerLeave={() => (dragRef.current = null)}
      >
        <defs>
          <radialGradient id="lsv-ambient" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#3f5f66" stopOpacity="0.08" />
            <stop offset="60%" stopColor="#4a3f5f" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lsv-bridge" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={MUTED_COLORS.cyan} />
            <stop offset="100%" stopColor={MUTED_COLORS.purple} />
          </linearGradient>
          <linearGradient id="lsv-fed" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={MUTED_COLORS.fuchsia} />
            <stop offset="100%" stopColor={MUTED_COLORS.cyan} />
          </linearGradient>
          <filter id="lsv-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={MUTED_COLORS.cyan} floodOpacity="0.45" />
          </filter>
          <style>{`
            .lsv-flow { stroke-dasharray: 5 9; animation: lsvFlow 1.4s linear infinite; }
            @keyframes lsvFlow { to { stroke-dashoffset: -14; } }
          `}</style>
        </defs>

        <ellipse cx={VIEW_W / 2} cy={VIEW_H / 2} rx={640} ry={380} fill="url(#lsv-ambient)" />

        {mode === "federation" ? (
          <FederationScene
            cam={cam}
            hubs={hubs}
            activeHubId={activeHubId}
            onSelectHub={(id) => guarded(() => selectHub(id))}
            onEnterHub={(id) => {
              selectHub(id);
              setMode("stack");
              setCam((c) => ({ ...c, zoom: 1 }));
            }}
          />
        ) : (
          <g>
            {drawOrder.map(({ layer, idx, selected, xOff, yWorld }) => {
              const nodeById = new Map(layer.nodes.map((n) => [n.id, n]));
              const c00 = project(-PLANE_W / 2 + xOff, yWorld, -PLANE_D / 2, cam);
              const c10 = project(PLANE_W / 2 + xOff, yWorld, -PLANE_D / 2, cam);
              const c11 = project(PLANE_W / 2 + xOff, yWorld, PLANE_D / 2, cam);
              const c01 = project(-PLANE_W / 2 + xOff, yWorld, PLANE_D / 2, cam);
              const xray = selected ? 1 : 0.38;

              return (
                <g
                  key={layer.id}
                  opacity={xray}
                  style={{ transition: "opacity 0.4s" }}
                  onClick={() => guarded(() => selectLayer(layer.id))}
                  onDoubleClick={() => setIsLayersViewOpen(false)}
                  className="cursor-pointer"
                >
                  <path
                    d={`M ${c00.x} ${c00.y} L ${c10.x} ${c10.y} L ${c11.x} ${c11.y} L ${c01.x} ${c01.y} Z`}
                    fill={selected ? "rgba(127,170,176,0.04)" : "rgba(255,255,255,0.02)"}
                    stroke={selected ? "rgba(127,170,176,0.45)" : "rgba(120,130,150,0.24)"}
                    strokeWidth={selected ? 1.4 : 0.8}
                    filter={selected ? "url(#lsv-glow)" : undefined}
                  />
                  <text x={c00.x} y={c00.y - 10} fontSize={selected ? 15 : 12} fontWeight={600} fill={selected ? "#B9D3D6" : "#71717a"}>
                    {layer.name}
                  </text>

                  {layer.edges.map((e) => {
                    const sn = nodeById.get(e.source);
                    const tn = nodeById.get(e.target);
                    if (!sn || !tn) return null;
                    const w1 = worldOf(sn, idx, xOff);
                    const w2 = worldOf(tn, idx, xOff);
                    const p1 = project(w1.x, w1.y, w1.z, cam);
                    const p2 = project(w2.x, w2.y, w2.z, cam);
                    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 7;
                    const trig = isTriggerHandle(e.sourceHandle);
                    return (
                      <path
                        key={e.id}
                        d={`M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`}
                        fill="none"
                        stroke={trig ? MUTED_COLORS.amber : MUTED_COLORS.blue}
                        strokeWidth={selected ? 1.6 : 1}
                        opacity={selected ? 0.85 : 0.6}
                      />
                    );
                  })}

                  {layer.nodes.map((n) => {
                    const w = worldOf(n, idx, xOff);
                    const p = project(w.x, w.y, w.z, cam);
                    const color = categoryColor(n.type);
                    const bridged = !!n.data.config?.sharedId;
                    const federated = !!n.data.config?.isFederated;
                    if (!selected) {
                      return (
                        <g key={n.id}>
                          {bridged && <circle cx={p.x} cy={p.y} r={8} fill="none" stroke={MUTED_COLORS.cyan} strokeWidth={1} opacity={0.7} />}
                          {federated && <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={MUTED_COLORS.fuchsia} strokeWidth={1} opacity={0.7} strokeDasharray="3 3" />}
                          <circle cx={p.x} cy={p.y} r={4.5} fill={color} opacity={0.9} />
                        </g>
                      );
                    }
                    const bw = 78, bh = 20;
                    const label = (n.data.label || n.type || "").slice(0, 13);
                    return (
                      <g key={n.id}>
                        {bridged && (
                          <rect x={p.x - bw / 2 - 4} y={p.y - bh / 2 - 4} width={bw + 8} height={bh + 8} rx={7} fill="none" stroke={MUTED_COLORS.cyan} strokeWidth={1.2} opacity={0.75} filter="url(#lsv-glow)" />
                        )}
                        {federated && (
                          <rect x={p.x - bw / 2 - 8} y={p.y - bh / 2 - 8} width={bw + 16} height={bh + 16} rx={9} fill="none" stroke={MUTED_COLORS.fuchsia} strokeWidth={1.2} opacity={0.75} strokeDasharray="4 4" />
                        )}
                        <rect x={p.x - bw / 2} y={p.y - bh / 2} width={bw} height={bh} rx={5} fill="#0c0c10" stroke={color} strokeWidth={1.3} />
                        <circle cx={p.x - bw / 2 + 8} cy={p.y} r={2.6} fill={color} />
                        <text x={p.x - bw / 2 + 15} y={p.y + 3.3} fontSize={9} fill="#d4d4d8" fontWeight={600}>
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Cross-layer bridge connectors */}
            {bridges.map((group, gi) =>
              group.slice(0, -1).map((a, i) => {
                const b = group[i + 1];
                const ma = layerMeta[a.li];
                const mb = layerMeta[b.li];
                const wa = worldOf(a.n, a.li, ma.xOff);
                const wb = worldOf(b.n, b.li, mb.xOff);
                const pa = project(wa.x, wa.y, wa.z, cam);
                const pb = project(wb.x, wb.y, wb.z, cam);
                const bow = 74;
                const d = `M ${pa.x} ${pa.y} C ${pa.x + bow} ${pa.y - 22}, ${pb.x + bow} ${pb.y + 22}, ${pb.x} ${pb.y}`;
                return (
                  <g key={`br_${gi}_${i}`} pointerEvents="none">
                    <path d={d} fill="none" stroke="url(#lsv-bridge)" strokeWidth={1.8} opacity={0.75} filter="url(#lsv-glow)" className="lsv-flow" />
                    <circle r={3} fill={MUTED_COLORS.cyan} filter="url(#lsv-glow)">
                      <animateMotion dur="2.6s" repeatCount="indefinite" path={d} />
                    </circle>
                    <circle cx={pa.x} cy={pa.y} r={3.2} fill={MUTED_COLORS.cyan} opacity={0.8} />
                    <circle cx={pb.x} cy={pb.y} r={3.2} fill={MUTED_COLORS.purple} opacity={0.8} />
                  </g>
                );
              })
            )}
          </g>
        )}
      </svg>

      {/* Hints */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600">
        {mode === "stack"
          ? "Drag to orbit · Shift+drag to pan · Scroll to zoom (out = Federation) · ← / → navigate · Click plane to select · Double-click or Enter to dive in · Esc to close"
          : "Drag to orbit · Shift+drag to pan · Scroll in to dive · Click cube to select hub · Double-click to open its stack · Esc to close"}
      </div>
    </div>
  );
}
