import { useMemo, useState } from "react";
import { useNodeEditorStore } from "../use-node-editor-store";
import { generateWeights } from "@/lib/execution-helpers";
import { Maximize2 } from "lucide-react";
import DenseLayer3DView from "../dense-layer-3d-view";
import { MAX_DOTS, buildChainNodeIds, buildLayerPlanes } from "./shared";

// Visual body for the Dense Layer node. Split out of ai-model-node-parts.tsx
// to keep each file under the repo's module size guardrail.

export function DenseLayerBody({ id, data }: { id: string; data: any }) {
  const [show3D, setShow3D] = useState(false);
  const nodes = useNodeEditorStore((s) => s.nodes);
  const edges = useNodeEditorStore((s) => s.edges);

  // Resolve the live incoming vector from whatever is wired into "in".
  const incoming = useNodeEditorStore((s) => {
    const edge = s.edges.find((e) => e.target === id && e.targetHandle === "in");
    if (!edge) return undefined;
    const src = s.nodes.find((n) => n.id === edge.source);
    return src?.data.outputs.find((o) => o.id === edge.sourceHandle)?.value;
  });

  const chainLayers = useMemo(() => {
    if (!show3D) return [];
    return buildLayerPlanes(buildChainNodeIds(id, nodes, edges), nodes);
  }, [show3D, id, nodes, edges]);

  const xs: number[] = Array.isArray(incoming) ? incoming.map(Number) : [];
  const neurons = Math.max(1, Math.min(64, Math.floor(Number(data.config?.neurons ?? 8) || 1)));
  const seed = Math.floor(Number(data.config?.seed ?? 42) || 0);
  const activations: number[] = Array.isArray(
    data.outputs?.find((o: any) => o.id === "out")?.value
  )
    ? data.outputs.find((o: any) => o.id === "out").value
    : [];

  const shownIn = Math.min(xs.length, MAX_DOTS);
  const shownOut = Math.min(neurons, MAX_DOTS);
  const weights = xs.length > 0 ? generateWeights(seed, xs.length, neurons) : [];

  const H = Math.max(shownIn, shownOut, 1) * 18 + 8;
  const yIn = (i: number) => 12 + i * ((H - 24) / Math.max(shownIn - 1, 1));
  const yOut = (j: number) => 12 + j * ((H - 24) / Math.max(shownOut - 1, 1));

  return (
    <div className="px-3.5 pb-2.5 space-y-1">
      {shownIn > 0 ? (
        <div
          className="relative group/web nodrag cursor-zoom-in"
          onDoubleClick={() => setShow3D(true)}
          title="Double-click to view the full weight web in 3D"
        >
        <svg width="100%" viewBox={`0 0 190 ${H}`} className="bg-zinc-950/60 rounded border border-zinc-900">
          {/* weight web: one line per (shown) input × neuron pair */}
          {Array.from({ length: shownIn }).map((_, i) =>
            Array.from({ length: shownOut }).map((_, j) => {
              const w = weights[j]?.[i] ?? 0;
              return (
                <line
                  key={`${i}-${j}`}
                  x1={20}
                  y1={yIn(i)}
                  x2={170}
                  y2={yOut(j)}
                  stroke={w >= 0 ? "#B99B72" : "#6FA69C"}
                  strokeWidth={1}
                  opacity={0.15 + Math.min(1, Math.abs(w)) * 0.75}
                />
              );
            })
          )}
          {/* input dots: brightness = incoming value */}
          {Array.from({ length: shownIn }).map((_, i) => {
            const v = Math.max(0, Math.min(1, xs[i] ?? 0));
            return (
              <circle key={`in${i}`} cx={20} cy={yIn(i)} r={4.5}
                fill={`rgb(${90 + v * 130},${110 + v * 120},${150 + v * 80})`} />
            );
          })}
          {/* neuron dots: brightness = activation */}
          {Array.from({ length: shownOut }).map((_, j) => {
            const v = Math.max(0, Math.min(1, activations[j] ?? 0));
            return (
              <circle key={`out${j}`} cx={170} cy={yOut(j)} r={4.5}
                fill={`rgb(${120 + v * 115},${100 + v * 90},${60 + v * 60})`} />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/web:bg-black/40 opacity-0 group-hover/web:opacity-100 transition rounded pointer-events-none">
          <div className="flex items-center gap-1 text-[9px] font-semibold text-zinc-200 bg-zinc-900/80 border border-zinc-700 rounded px-2 py-1">
            <Maximize2 size={10} /> View in 3D
          </div>
        </div>
        </div>
      ) : (
        <div className="h-14 rounded border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
          Wire values in to grow the web
        </div>
      )}
      <p className="text-[9px] text-zinc-600 leading-tight">
        {xs.length} inputs × {neurons} neurons = {xs.length * neurons} weights
        {xs.length > MAX_DOTS || neurons > MAX_DOTS ? ` (showing ${shownIn}×${shownOut} — double-click to see all in 3D)` : ""}
      </p>

      {show3D && chainLayers.length > 0 && (
        <DenseLayer3DView layers={chainLayers} onClose={() => setShow3D(false)} />
      )}
    </div>
  );
}
