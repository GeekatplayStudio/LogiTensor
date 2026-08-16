import { useMemo, useState } from "react";
import { useNodeEditorStore } from "../use-node-editor-store";
import { conv1dFullWeights, conv1dOutputPositions } from "@/lib/execution-helpers";
import { Maximize2 } from "lucide-react";
import DenseLayer3DView from "../dense-layer-3d-view";
import { MAX_DOTS, buildChainNodeIds, buildLayerPlanes } from "./shared";

// Visual body for the Conv1D Layer node. Split out of ai-model-node-parts.tsx
// to keep each file under the repo's module size guardrail.

export function Conv1DLayerBody({ id, data }: { id: string; data: any }) {
  const [show3D, setShow3D] = useState(false);
  const nodes = useNodeEditorStore((s) => s.nodes);
  const edges = useNodeEditorStore((s) => s.edges);

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
  const filters = Math.max(1, Math.min(32, Math.floor(Number(data.config?.filters ?? 4) || 1)));
  const kernelSize = Math.max(1, Math.min(16, Math.floor(Number(data.config?.kernelSize ?? 3) || 1)));
  const stride = Math.max(1, Math.floor(Number(data.config?.stride ?? 1) || 1));
  const seed = Math.floor(Number(data.config?.seed ?? 42) || 0);
  const positions = conv1dOutputPositions(xs.length, kernelSize, stride);
  const featureMap: number[] = Array.isArray(data.outputs?.find((o: any) => o.id === "out")?.value)
    ? data.outputs.find((o: any) => o.id === "out").value
    : [];

  const shownIn = Math.min(xs.length, MAX_DOTS * 2); // local windows stay readable even a bit wider
  const shownOut = Math.min(featureMap.length, MAX_DOTS);
  const weights = xs.length > 0 ? conv1dFullWeights(xs.length, seed, kernelSize, filters, stride) : [];

  const H = Math.max(shownIn, shownOut, 1) * 14 + 8;
  const yIn = (i: number) => 12 + i * ((H - 24) / Math.max(shownIn - 1, 1));
  const yOut = (j: number) => 12 + j * ((H - 24) / Math.max(shownOut - 1, 1));

  return (
    <div className="px-3.5 pb-2.5 space-y-1">
      {shownIn > 0 && positions > 0 ? (
        <div
          className="relative group/web nodrag cursor-zoom-in"
          onDoubleClick={() => setShow3D(true)}
          title="Double-click to view the full feature map in 3D"
        >
        <svg width="100%" viewBox={`0 0 190 ${H}`} className="bg-zinc-950/60 rounded border border-zinc-900">
          {/* Sparse local connections only — each output links to just its kernel window, not every input */}
          {Array.from({ length: shownIn }).map((_, i) =>
            Array.from({ length: shownOut }).map((_, j) => {
              const w = weights[j]?.[i] ?? 0;
              if (Math.abs(w) < 0.02) return null;
              return (
                <line
                  key={`${i}-${j}`}
                  x1={20}
                  y1={yIn(i)}
                  x2={170}
                  y2={yOut(j)}
                  stroke={w >= 0 ? "#B99B72" : "#6FA69C"}
                  strokeWidth={1}
                  opacity={0.2 + Math.min(1, Math.abs(w)) * 0.75}
                />
              );
            })
          )}
          {Array.from({ length: shownIn }).map((_, i) => {
            const v = Math.max(0, Math.min(1, xs[i] ?? 0));
            return (
              <circle key={`in${i}`} cx={20} cy={yIn(i)} r={4}
                fill={`rgb(${90 + v * 130},${110 + v * 120},${150 + v * 80})`} />
            );
          })}
          {Array.from({ length: shownOut }).map((_, j) => {
            const v = Math.max(0, Math.min(1, featureMap[j] ?? 0));
            return (
              <circle key={`out${j}`} cx={170} cy={yOut(j)} r={4}
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
          {xs.length > 0 ? "Kernel larger than input — shrink Kernel Size or Stride" : "Wire values in"}
        </div>
      )}
      <p className="text-[9px] text-zinc-600 leading-tight">
        {xs.length} inputs, kernel {kernelSize} × {filters} filters → {featureMap.length} outputs
        {xs.length > shownIn || featureMap.length > MAX_DOTS ? " (double-click to see all in 3D)" : ""}
      </p>

      {show3D && chainLayers.length > 0 && (
        <DenseLayer3DView layers={chainLayers} onClose={() => setShow3D(false)} />
      )}
    </div>
  );
}
