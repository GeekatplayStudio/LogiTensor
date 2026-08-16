import { useMemo, useState } from "react";
import { useNodeEditorStore } from "../use-node-editor-store";
import DenseLayer3DView from "../dense-layer-3d-view";
import { buildChainNodeIds, buildLayerPlanes } from "./shared";

// Visual body for the Output Layer node. Split out of ai-model-node-parts.tsx
// to keep each file under the repo's module size guardrail.

export function OutputLayerBody({ id, data }: { id: string; data: any }) {
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
  const winner = data.outputs?.find((o: any) => o.id === "winner")?.value ?? -1;
  const shown = xs.slice(0, 16);
  const max = Math.max(...shown.map((v) => Math.abs(v)), 0.0001);

  return (
    <div className="px-3.5 pb-2.5 space-y-1">
      {shown.length > 0 ? (
        <div
          className="space-y-0.5 bg-zinc-950/60 rounded border border-zinc-900 p-1.5 nodrag cursor-zoom-in"
          onDoubleClick={() => setShow3D(true)}
          title="Double-click to view the whole network in 3D"
        >
          {shown.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`w-4 text-right font-mono text-[8px] ${i === winner ? "text-[#D8B98A] font-bold" : "text-zinc-600"}`}>
                {i}
              </span>
              <div className="flex-1 h-2 bg-zinc-900 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(Math.abs(v) / max) * 100}%`,
                    backgroundColor: i === winner ? "#D8B98A" : "#7C93B5",
                  }}
                />
              </div>
              <span className="w-8 font-mono text-[8px] text-zinc-500">{v.toFixed(2)}</span>
            </div>
          ))}
          {xs.length > 16 && (
            <p className="text-[8px] text-zinc-600">…{xs.length - 16} more</p>
          )}
        </div>
      ) : (
        <div className="h-10 rounded border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
          Wire activations in
        </div>
      )}
      {winner >= 0 && (
        <p className="text-[9px] text-zinc-500">
          Winner: neuron <span className="font-mono font-bold text-[#D8B98A]">{winner}</span>
        </p>
      )}

      {show3D && chainLayers.length > 0 && (
        <DenseLayer3DView layers={chainLayers} onClose={() => setShow3D(false)} />
      )}
    </div>
  );
}
