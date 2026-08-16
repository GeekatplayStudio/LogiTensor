import { Edge, Node } from "@xyflow/react";
import { NodeData } from "@/types/nodes";
import { Hub, Layer } from "./types";

// Monotonic counter appended to Date.now()-based ids so two created in the same
// millisecond (e.g. rapid double-clicks) never collide.
let uniqueIdCounter = 0;
export const uniqueId = (prefix: string): string => `${prefix}_${Date.now()}_${uniqueIdCounter++}`;

// Returns the next value of the shared monotonic counter for callers that
// build their own id strings (ESM module bindings are read-only, so the
// counter itself cannot be mutated from other modules).
export const nextUniqueIdSuffix = (): number => uniqueIdCounter++;

// Combines the same input port's value collected across every dimension instance
// of a multi-dimensional node: numbers sum, booleans OR, strings join — otherwise
// the first defined value wins. This is the "process as multiple inputs" rule.
export function combineDimensionValues(values: any[]): any {
  const defined = values.filter((v) => v !== undefined && v !== null);
  if (defined.length === 0) return null;
  if (
    defined.every(
      (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))
    )
  ) {
    return defined.reduce((sum: number, v) => sum + Number(v), 0);
  }
  if (defined.every((v) => typeof v === "boolean")) {
    return defined.some((v) => v === true);
  }
  if (defined.every((v) => typeof v === "string")) {
    return defined.join(" | ");
  }
  return defined[0];
}

// Resolves a node's data inputs against a specific node/edge list — used to evaluate
// a shared multi-dimensional node's instance living in a different dimension/layer.
export function resolveNodeInputs(
  node: Node<NodeData>,
  nodeList: Node<NodeData>[],
  edgeList: Edge[]
): Record<string, any> {
  const inputs: Record<string, any> = {};
  for (const input of node.data.inputs) {
    if (input.type === "trigger") continue;
    const incomingEdge = edgeList.find((e) => e.target === node.id && e.targetHandle === input.id);
    if (incomingEdge) {
      const sourceNode = nodeList.find((n) => n.id === incomingEdge.source);
      const sourcePort = sourceNode?.data.outputs.find((o) => o.id === incomingEdge.sourceHandle);
      inputs[input.id] = sourcePort ? sourcePort.value : input.value;
    } else {
      inputs[input.id] = input.value;
    }
  }
  return inputs;
}

// Keeps a node's lettered inputs elastic (any node with config.dynamicInputs,
// e.g. Formula, Max Selector): when every data input is connected, a fresh
// letter appears; extra trailing unconnected letters are trimmed back so
// exactly one spare input is always available (min a + b).
export function adjustFormulaInputs(node: Node<NodeData>, edges: Edge[]): Node<NodeData> | null {
  if (!node.data.config?.dynamicInputs) return null;
  const connected = new Set(
    edges.filter((e) => e.target === node.id).map((e) => e.targetHandle)
  );
  const isConnected = (id: string) => connected.has(id);
  const isLetterId = (id: string) => /^[a-z]$/.test(id);

  // Non-lettered ports (like the Enabled bypass) sit outside the elastic
  // lettered range and must not shift its length-based letter math.
  const letters = node.data.inputs.filter((i) => isLetterId(i.id));
  const otherInputs = node.data.inputs.filter((i) => !isLetterId(i.id));
  const originalLetterCount = letters.length;

  // Trim trailing unconnected letters down to one spare (never below 2 total)
  while (
    letters.length > 2 &&
    !isConnected(letters[letters.length - 1].id) &&
    !isConnected(letters[letters.length - 2].id)
  ) {
    letters.pop();
  }
  // Grow when every lettered input is connected
  if (letters.every((i) => isConnected(i.id)) && letters.length < 26) {
    const letter = String.fromCharCode(97 + letters.length);
    letters.push({ id: letter, name: letter.toUpperCase(), type: "data", dataType: "any", value: 0 });
  }

  if (letters.length === originalLetterCount) return null;
  const inputs = [...letters, ...otherInputs];
  return { ...node, data: { ...node.data, inputs } };
}

// Writes computed output port values (and evaluation error state) onto a node.
export function applyComputedOutputs(
  node: Node<NodeData>,
  outputs: Record<string, any>,
  executionState: "idle" | "error",
  errorMessage: string | undefined
): Node<NodeData> {
  const updatedOutputs = node.data.outputs.map((outPort) =>
    outputs[outPort.id] !== undefined ? { ...outPort, value: outputs[outPort.id] } : outPort
  );
  return {
    ...node,
    data: {
      ...node.data,
      outputs: updatedOutputs,
      executionState: executionState === "error" ? "error" : node.data.executionState,
      errorMessage,
    },
  };
}

// Deep-copies a layer's contents with remapped node/edge ids so a copy never
// collides with the original when layers are merged for backend execution.
export function cloneLayerContents(nodes: Node<NodeData>[], edges: Edge[]) {
  const idMap = new Map<string, string>();
  const newNodes = nodes.map((n, idx) => {
    const newId = `${n.id}_copy${Date.now()}_${nextUniqueIdSuffix()}_${idx}`;
    idMap.set(n.id, newId);
    return { ...n, id: newId, selected: false };
  });
  const newEdges = edges.map((e, idx) => ({
    ...e,
    id: uniqueId(`edge_${idx}`),
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }));
  return { nodes: newNodes, edges: newEdges };
}

// Folds the live canvas state (nodes/edges of the active layer) back into the
// layers array, and the live layers back into the active hub — producing fully
// materialized snapshots for hub switching, the federation view, and saving.
export function syncHubs(s: {
  nodes: Node<NodeData>[];
  edges: Edge[];
  layers: Layer[];
  activeLayerId: string;
  hubs: Hub[];
  activeHubId: string;
}): { liveLayers: Layer[]; hubs: Hub[] } {
  const liveLayers = s.layers.map((l) =>
    l.id === s.activeLayerId ? { ...l, nodes: s.nodes, edges: s.edges } : l
  );
  const hubs = s.hubs.map((h) =>
    h.id === s.activeHubId ? { ...h, layers: liveLayers, activeLayerId: s.activeLayerId } : h
  );
  return { liveLayers, hubs };
}
