import { generateWeights, conv1dFullWeights } from "@/lib/execution-helpers";
import { LayerPlane } from "../dense-layer-3d-view";

// Shared helpers for the AI Model node bodies (Dense, Conv1D, Output). Split
// out of ai-model-node-parts.tsx to keep each file under the repo's module
// size guardrail.

// Caps how many dots each column draws so the web stays readable; the counts
// caption still reports the real totals.
export const MAX_DOTS = 10;

const CHAINABLE_TYPES = new Set(["imageInputGrid", "denseLayer", "conv1dLayer", "outputLayerNode"]);

// Walks the wired AI Model chain (Image Grid → Dense → Dense → … → Output)
// both backward and forward from whichever node was double-clicked, so the 3D
// view always shows the WHOLE network, not just the one layer you opened it from.
export function buildChainNodeIds(startId: string, nodes: any[], edges: any[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = [startId];

  let cur = startId;
  while (true) {
    const edge = edges.find((e) => e.target === cur && e.targetHandle === "in");
    if (!edge) break;
    const src = byId.get(edge.source);
    if (!src || !CHAINABLE_TYPES.has(src.type)) break;
    ids.unshift(src.id);
    if (src.type === "imageInputGrid") break; // nothing feeds an image grid
    cur = src.id;
  }

  cur = startId;
  while (true) {
    const edge = edges.find((e) => e.source === cur && (e.sourceHandle === "out" || e.sourceHandle === "values"));
    if (!edge) break;
    const tgt = byId.get(edge.target);
    if (!tgt || !CHAINABLE_TYPES.has(tgt.type)) break;
    ids.push(tgt.id);
    if (tgt.type === "outputLayerNode") break; // terminal — just relays values
    cur = tgt.id;
  }

  return ids;
}

// Turns a chain of node ids into the LayerPlane[] the 3D viewer renders:
// each Dense Layer's real weight matrix generated against the PRECEDING
// plane's actual size, so multi-hop chains (like a classic MLP diagram) get
// their own correct weights per hop, not just the single layer clicked.
export function buildLayerPlanes(ids: string[], nodes: any[]): LayerPlane[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const planes: LayerPlane[] = [];
  let prevLen = 0;

  for (const id of ids) {
    const n = byId.get(id);
    if (!n) continue;

    if (n.type === "imageInputGrid") {
      const values: number[] = Array.isArray(n.data.outputs?.find((o: any) => o.id === "values")?.value)
        ? n.data.outputs.find((o: any) => o.id === "values").value
        : [];
      planes.push({ label: n.data.label || "Image Grid", values });
      prevLen = values.length;
    } else if (n.type === "denseLayer") {
      const neurons = Math.max(1, Math.min(64, Math.floor(Number(n.data.config?.neurons ?? 8) || 1)));
      const seed = Math.floor(Number(n.data.config?.seed ?? 42) || 0);
      const activations: number[] = Array.isArray(n.data.outputs?.find((o: any) => o.id === "out")?.value)
        ? n.data.outputs.find((o: any) => o.id === "out").value
        : [];
      const weights = prevLen > 0 ? generateWeights(seed, prevLen, neurons) : undefined;
      planes.push({ label: n.data.label || "Dense Layer", values: activations, weights });
      prevLen = activations.length;
    } else if (n.type === "conv1dLayer") {
      const filters = Math.max(1, Math.min(32, Math.floor(Number(n.data.config?.filters ?? 4) || 1)));
      const kernelSize = Math.max(1, Math.min(16, Math.floor(Number(n.data.config?.kernelSize ?? 3) || 1)));
      const stride = Math.max(1, Math.floor(Number(n.data.config?.stride ?? 1) || 1));
      const seed = Math.floor(Number(n.data.config?.seed ?? 42) || 0);
      const featureMap: number[] = Array.isArray(n.data.outputs?.find((o: any) => o.id === "out")?.value)
        ? n.data.outputs.find((o: any) => o.id === "out").value
        : [];
      const weights = prevLen > 0 ? conv1dFullWeights(prevLen, seed, kernelSize, filters, stride) : undefined;
      planes.push({ label: n.data.label || "Conv1D Layer", values: featureMap, weights });
      prevLen = featureMap.length;
    } else if (n.type === "outputLayerNode") {
      const values: number[] = Array.isArray(n.data.outputs?.find((o: any) => o.id === "out")?.value)
        ? n.data.outputs.find((o: any) => o.id === "out").value
        : [];
      const winnerVal = n.data.outputs?.find((o: any) => o.id === "winner")?.value;
      planes.push({
        label: n.data.label || "Output",
        values,
        winner: typeof winnerVal === "number" ? winnerVal : undefined,
      });
      prevLen = values.length;
    }
  }

  return planes;
}
