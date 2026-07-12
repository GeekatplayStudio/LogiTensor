"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Camera, DEFAULT_CAMERA, project, clampPitch, clampZoom } from "@/lib/stack-3d-math";

// Full-screen 3D viewer for a chain of AI Model layers — every input × neuron
// connection in every hop of the chain, drawn with its actual generated
// weight (same seeded generateWeights() each node computes with), real live
// values and activations. Reuses the exact camera/projection math the
// Dimension Stack and Federation views run on, just pointed at a different
// scene. Works for a single Dense Layer or a whole
// Image Grid → Dense → Dense → … → Output chain, like a real MLP diagram.
//
// Rendered on <canvas> rather than SVG: a 32×32 grid feeding 64 neurons is
// 65,536 connections, and canvas draws that at 60fps where an SVG with one
// DOM node per line would choke the browser.

const PLANE_GAP = 300; // world-space x distance between consecutive layer planes
const DOT_SPACING = 14; // world-space y/z distance between stacked dots in a field
// Every real connection is drawn — canvas comfortably handles tens of
// thousands of strokes per frame. Only past this count do we start sampling,
// purely so an extreme web (hundreds of thousands of connections) doesn't
// stall the browser; below it, nothing is silently dropped.
const SAMPLE_ABOVE = 40000;

export interface LayerPlane {
  label: string;
  values: number[];
  // Weights INTO this layer from the previous plane: weights[thisIdx][prevIdx].
  // Omitted for the first plane (nothing feeds it) and for a plain passthrough
  // hop (e.g. Output Layer, which just relays the prior layer's values 1:1).
  weights?: number[][];
  winner?: number;
}

interface Props {
  layers: LayerPlane[];
  onClose: () => void;
}

// Each plane is laid out as a 2D field in (y, z) — not a single line — so
// orbiting the camera actually reveals depth instead of just squashing a flat
// wedge. Roughly square grid, centered on the plane's local origin.
function gridLayout(n: number): { y: number; z: number }[] {
  if (n === 0) return [];
  const cols = Math.max(1, Math.round(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const pts: { y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    pts.push({
      y: (row - (rows - 1) / 2) * DOT_SPACING,
      z: (col - (cols - 1) / 2) * DOT_SPACING,
    });
  }
  return pts;
}

export default function DenseLayer3DView({ layers, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cam, setCam] = useState<Camera>({ ...DEFAULT_CAMERA, zoom: 0.7 });
  const dragRef = useRef<{ x: number; y: number; cam: Camera; pan: boolean } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grids = useMemo(() => layers.map((l) => gridLayout(l.values.length)), [layers]);

  // Plane x-position: centered across however many layers are in the chain.
  const planeX = useMemo(() => {
    const n = layers.length;
    const start = -((n - 1) * PLANE_GAP) / 2;
    return Array.from({ length: n }, (_, i) => start + i * PLANE_GAP);
  }, [layers.length]);

  // Counts actual nonzero weights, not the dense matrix size — a Conv1D
  // Layer's matrix is mostly zero (local receptive fields), so a raw
  // rows*cols count would wildly overstate how many connections are real.
  const totalConnections = useMemo(
    () =>
      layers.reduce((sum, l) => {
        if (!l.weights) return sum;
        let count = 0;
        for (const row of l.weights) for (const w of row) if (Math.abs(w) >= 0.02) count++;
        return sum + count;
      }, 0),
    [layers]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, size.w, size.h);

    const ox = (size.w - 1440) / 2;
    const oy = (size.h - 860) / 2;
    const p = (x: number, y: number, z: number) => {
      const r = project(x, y, z, cam);
      return { x: r.x + ox, y: r.y + oy, depth: r.depth };
    };

    // Project every plane's dots once.
    const planePts = layers.map((l, k) =>
      l.values.map((v, i) => ({ v, ...p(planeX[k], grids[k][i].y, grids[k][i].z) }))
    );

    // Connections, hop by hop — additive blend so overlapping strong weights
    // glow brighter, with per-hop density scaling so a dense hop doesn't just
    // blow out to solid white.
    ctx.globalCompositeOperation = "lighter";
    for (let k = 1; k < layers.length; k++) {
      const weights = layers[k].weights;
      if (!weights) {
        // Plain passthrough hop (e.g. Output Layer relaying values 1:1) —
        // no real weight to show, but draw faint identity lines so the chain
        // still reads as connected instead of a floating disconnected plane.
        const prevPts = planePts[k - 1];
        const curPts = planePts[k];
        const n = Math.min(prevPts.length, curPts.length);
        for (let i = 0; i < n; i++) {
          const a = prevPts[i];
          const b = curPts[i];
          ctx.strokeStyle = "rgba(140,140,150,0.18)";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        continue;
      }
      const prevPts = planePts[k - 1];
      const curPts = planePts[k];
      const total = prevPts.length * curPts.length;
      // Only sample past SAMPLE_ABOVE, and even then just to cap draw calls —
      // not to hide real connections at any web size a Dense Layer can reach.
      const stride = total > SAMPLE_ABOVE ? Math.ceil(total / SAMPLE_ABOVE) : 1;
      // Gentle (sqrt) falloff so a moderately dense hop doesn't get crushed
      // as hard as a linear falloff would — only truly huge webs dim much.
      const densityScale = Math.min(1, Math.sqrt(600 / Math.max(1, total / stride)));

      let count = 0;
      for (let i = 0; i < prevPts.length; i++) {
        for (let j = 0; j < curPts.length; j++) {
          count++;
          if (count % stride !== 0) continue;
          const w = weights[j]?.[i] ?? 0;
          const mag = Math.min(1, Math.abs(w));
          if (mag < 0.02) continue;
          const a = prevPts[i];
          const b = curPts[j];
          const alpha = Math.max(0.05, (0.12 + mag * 0.5) * densityScale);
          ctx.strokeStyle = w >= 0 ? `rgba(185,155,114,${alpha})` : `rgba(111,166,156,${alpha})`;
          ctx.lineWidth = 0.4 + mag * 1.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // Dots — brightness by real value/activation; the terminal layer's
    // winner (if any) glows amber.
    const drawDot = (pt: { x: number; y: number }, v: number, isFirst: boolean, isWinner: boolean) => {
      const t = Math.max(0, Math.min(1, v));
      const r = isWinner ? 7 : 4.5 + t * 2;
      const color = isWinner
        ? "#D8B98A"
        : isFirst
          ? `rgb(${90 + t * 130},${110 + t * 120},${150 + t * 80})`
          : `rgb(${120 + t * 115},${100 + t * 90},${60 + t * 60})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isWinner ? 18 : 6 + t * 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    layers.forEach((l, k) => {
      planePts[k].forEach((pt, i) => drawDot(pt, pt.v, k === 0, i === l.winner));
    });

    // Plane labels, above each field's topmost row.
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#71717a";
    ctx.textAlign = "center";
    layers.forEach((l, k) => {
      const minY = grids[k].length ? Math.min(...grids[k].map((g) => g.y)) : 0;
      const top = p(planeX[k], minY, 0);
      ctx.fillText(`${l.label} (${l.values.length})`, top.x, top.y - 22);
    });
  }, [cam, size, layers, grids, planeX]);

  const onWheel = (e: React.WheelEvent) => {
    setCam((c) => ({ ...c, zoom: clampZoom(c.zoom * (e.deltaY < 0 ? 1.08 : 0.92)) }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-sm">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: "block", cursor: "grab" }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, cam, pan: e.shiftKey };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (d.pan) {
            setCam({ ...d.cam, panX: d.cam.panX + dx, panY: d.cam.panY + dy });
          } else {
            setCam({ ...d.cam, yaw: d.cam.yaw + dx * 0.005, pitch: clampPitch(d.cam.pitch + dy * 0.004) });
          }
        }}
        onPointerUp={() => (dragRef.current = null)}
        onPointerLeave={() => (dragRef.current = null)}
      />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/60 rounded-lg px-3 py-1.5">
        <span className="text-[10px] font-bold text-[#9AC0C4] uppercase tracking-wide">
          {layers.map((l) => l.label).join(" → ")}
        </span>
        <span className="text-zinc-700">/</span>
        <span className="text-[10px] text-zinc-500">{totalConnections} real connections</span>
      </div>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-950/70 backdrop-blur-md border border-zinc-800/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition"
        title="Close (Esc)"
      >
        <X size={16} />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600">
        Drag to orbit · Shift+drag to pan · Scroll to zoom · Esc to close
      </div>
    </div>,
    document.body
  );
}
