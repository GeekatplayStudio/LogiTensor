import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from "@xyflow/react";
import { NodeData, NODE_DEFINITIONS } from "@/types/nodes";
import { computeNodeOutputs, handleTriggerOperation, resolveConditionFlag } from "@/lib/execution-helpers";
import { getPortColor } from "@/lib/node-styles";
import { toast } from "sonner";

// Monotonic counter appended to Date.now()-based ids so two created in the same
// millisecond (e.g. rapid double-clicks) never collide.
let uniqueIdCounter = 0;
const uniqueId = (prefix: string): string => `${prefix}_${Date.now()}_${uniqueIdCounter++}`;

// Format edge label text previews
const formatEdgeValue = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") return "Object";
  const str = String(val);
  return str.length > 15 ? str.substring(0, 12) + "..." : str;
};

// Combines the same input port's value collected across every dimension instance
// of a multi-dimensional node: numbers sum, booleans OR, strings join — otherwise
// the first defined value wins. This is the "process as multiple inputs" rule.
function combineDimensionValues(values: any[]): any {
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
function resolveNodeInputs(
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

// Keeps a Formula node's lettered inputs elastic: when every data input is
// connected, a fresh letter appears; extra trailing unconnected letters are
// trimmed back so exactly one spare input is always available (min a + b).
function adjustFormulaInputs(node: Node<NodeData>, edges: Edge[]): Node<NodeData> | null {
  if (node.type !== "mathNode") return null;
  const connected = new Set(
    edges.filter((e) => e.target === node.id).map((e) => e.targetHandle)
  );
  const inputs = [...node.data.inputs];
  const isConnected = (id: string) => connected.has(id);

  // Trim trailing unconnected inputs down to one spare (never below 2 total)
  while (
    inputs.length > 2 &&
    !isConnected(inputs[inputs.length - 1].id) &&
    !isConnected(inputs[inputs.length - 2].id)
  ) {
    inputs.pop();
  }
  // Grow when everything is connected
  if (inputs.every((i) => isConnected(i.id)) && inputs.length < 26) {
    const letter = String.fromCharCode(97 + inputs.length);
    inputs.push({ id: letter, name: letter.toUpperCase(), type: "data", dataType: "any", value: 0 });
  }

  if (inputs.length === node.data.inputs.length) return null;
  return { ...node, data: { ...node.data, inputs } };
}

// Writes computed output port values (and evaluation error state) onto a node.
function applyComputedOutputs(
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

export interface Layer {
  id: string;
  name: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

// A Hub is one complete multi-dimensional workflow: a named collection of
// layers. The Federation is the space of many hubs, linked through nodes
// flagged as federation endpoints.
export interface Hub {
  id: string;
  name: string;
  layers: Layer[];
  activeLayerId: string;
}

// Deep-copies a layer's contents with remapped node/edge ids so a copy never
// collides with the original when layers are merged for backend execution.
function cloneLayerContents(nodes: Node<NodeData>[], edges: Edge[]) {
  const idMap = new Map<string, string>();
  const newNodes = nodes.map((n, idx) => {
    const newId = `${n.id}_copy${Date.now()}_${uniqueIdCounter++}_${idx}`;
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

interface NodeEditorState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  isRunning: boolean;
  stepDelayMs: number;
  setStepDelayMs: (delay: number) => void;
  runLoops: number;
  setRunLoops: (loops: number) => void;
  
  // Layers State
  layers: Layer[];
  activeLayerId: string;
  isLayersViewOpen: boolean;
  addLayer: () => void;
  duplicateLayer: (id: string) => void;
  selectLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  setIsLayersViewOpen: (open: boolean) => void;
  toggleNodeMultiDimensional: (nodeId: string) => void;

  // Federation (hubs) State
  hubs: Hub[];
  activeHubId: string;
  addHub: () => void;
  duplicateHub: (id: string) => void;
  deleteHub: (id: string) => void;
  selectHub: (id: string) => void;
  renameHub: (id: string, name: string) => void;
  toggleNodeFederated: (nodeId: string) => void;
  
  // React Flow Handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  disconnectHandle: (nodeId: string, handleId: string, type: "source" | "target") => void;
  
  // Canvas Actions
  addNode: (type: string, x: number, y: number) => void;
  deleteNode: (id: string) => void;
  clearBoard: () => void;
  updateNodeConfig: (id: string, config: Record<string, any>) => void;
  updateNodeInputStaticValue: (nodeId: string, inputId: string, value: any) => void;
  
  // Execution Engine
  evaluateNode: (nodeId: string) => void;
  triggerNode: (nodeId: string, outputPortId: string) => Promise<void>;
  runAll: () => Promise<void>;
  resetExecutionStates: () => void;
  
  // Serialization
  saveToFile: () => void;
  loadFromFile: (jsonContent: string) => void;
}

// Folds the live canvas state (nodes/edges of the active layer) back into the
// layers array, and the live layers back into the active hub — producing fully
// materialized snapshots for hub switching, the federation view, and saving.
function syncHubs(s: {
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

export const useNodeEditorStore = create<NodeEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  isRunning: false,
  stepDelayMs: 300,
  setStepDelayMs: (delay) => set({ stepDelayMs: delay }),
  runLoops: 1,
  setRunLoops: (loops) => set({ runLoops: loops }),

  // Layers state
  layers: [{ id: "layer_default", name: "Dimension Alpha", nodes: [], edges: [] }],
  activeLayerId: "layer_default",
  isLayersViewOpen: false,

  // Federation state
  hubs: [
    {
      id: "hub_default",
      name: "Hub Prime",
      layers: [{ id: "layer_default", name: "Dimension Alpha", nodes: [], edges: [] }],
      activeLayerId: "layer_default",
    },
  ],
  activeHubId: "hub_default",

  addHub: () => {
    const { hubs } = syncHubs(get());
    const layerId = uniqueId("layer");
    const hub: Hub = {
      id: uniqueId("hub"),
      name: `Hub ${hubs.length + 1}`,
      layers: [{ id: layerId, name: "Dimension Alpha", nodes: [], edges: [] }],
      activeLayerId: layerId,
    };
    set({ hubs: [...hubs, hub] });
    toast.success(`Created ${hub.name}`);
  },

  duplicateHub: (id) => {
    const { hubs } = syncHubs(get());
    const src = hubs.find((h) => h.id === id);
    if (!src) return;
    const newLayers = src.layers.map((l) => {
      const c = cloneLayerContents(l.nodes, l.edges);
      return { id: uniqueId("layer"), name: l.name, nodes: c.nodes, edges: c.edges };
    });
    const activeIdx = Math.max(0, src.layers.findIndex((l) => l.id === src.activeLayerId));
    const hub: Hub = {
      id: uniqueId("hub"),
      name: `${src.name} Copy`,
      layers: newLayers,
      activeLayerId: newLayers[activeIdx]?.id ?? newLayers[0]?.id ?? "",
    };
    set({ hubs: [...hubs, hub] });
    toast.success(`Duplicated "${src.name}" to "${hub.name}"`);
  },

  deleteHub: (id) => {
    const s = get();
    if (s.hubs.length <= 1) {
      toast.error("Cannot delete the last remaining hub!");
      return;
    }
    const { hubs } = syncHubs(s);
    const remaining = hubs.filter((h) => h.id !== id);
    if (s.activeHubId === id) {
      const next = remaining[0];
      const activeLayer =
        next.layers.find((l) => l.id === next.activeLayerId) ?? next.layers[0];
      set({
        hubs: remaining,
        activeHubId: next.id,
        layers: next.layers,
        activeLayerId: activeLayer?.id ?? "",
        nodes: activeLayer?.nodes ?? [],
        edges: activeLayer?.edges ?? [],
      });
    } else {
      set({ hubs: remaining });
    }
    toast.success("Hub deleted.");
  },

  selectHub: (id) => {
    const s = get();
    if (id === s.activeHubId) return;
    const { hubs } = syncHubs(s);
    const target = hubs.find((h) => h.id === id);
    if (!target) return;
    const activeLayer =
      target.layers.find((l) => l.id === target.activeLayerId) ?? target.layers[0];
    set({
      hubs,
      activeHubId: id,
      layers: target.layers,
      activeLayerId: activeLayer?.id ?? "",
      nodes: activeLayer?.nodes ?? [],
      edges: activeLayer?.edges ?? [],
    });
  },

  renameHub: (id, name) => {
    set((state) => ({
      hubs: state.hubs.map((h) => (h.id === id ? { ...h, name } : h)),
    }));
  },

  renameLayer: (id, name) => {
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    }));
  },

  toggleNodeFederated: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const fed = !node.data.config?.isFederated;
    const sid = node.data.config?.sharedId;
    const patch = (n: Node<NodeData>): Node<NodeData> => ({
      ...n,
      data: { ...n.data, config: { ...n.data.config, isFederated: fed } },
    });
    set((state) => ({
      // Keep multi-dimensional clones in sync so the federation flag is a
      // property of the logical node, not one visual instance of it.
      nodes: state.nodes.map((n) =>
        n.id === nodeId || (sid && n.data.config?.sharedId === sid) ? patch(n) : n
      ),
      layers: state.layers.map((l) => ({
        ...l,
        nodes: l.nodes.map((n) => (sid && n.data.config?.sharedId === sid ? patch(n) : n)),
      })),
    }));
    toast.success(
      fed
        ? `"${node.data.label}" is now a federation endpoint`
        : `"${node.data.label}" federation link removed`
    );
  },
  
  addLayer: () => {
    const id = uniqueId("layer");
    const count = get().layers.length + 1;
    const name = `Dimension ${String.fromCharCode(64 + count)}`; // Dimension B, C, etc.
    const newLayer: Layer = { id, name, nodes: [], edges: [] };
    set((state) => ({ layers: [...state.layers, newLayer] }));
    toast.success(`Created ${name}`);
  },

  duplicateLayer: (id) => {
    const { layers, activeLayerId, nodes, edges } = get();
    const sourceLayer = layers.find((l) => l.id === id);
    if (!sourceLayer) return;

    // Use live canvas state if duplicating the currently active layer
    const sourceNodes = id === activeLayerId ? nodes : sourceLayer.nodes;
    const sourceEdges = id === activeLayerId ? edges : sourceLayer.edges;

    const cloned = cloneLayerContents(sourceNodes, sourceEdges);
    const newLayer: Layer = {
      id: uniqueId("layer"),
      name: `${sourceLayer.name} Copy`,
      nodes: cloned.nodes,
      edges: cloned.edges,
    };

    // Sync the active layer's live canvas state back into the layers array
    // before appending, so the source layer isn't left stale.
    const syncedLayers = layers.map((l) =>
      l.id === activeLayerId ? { ...l, nodes, edges } : l
    );

    set({ layers: [...syncedLayers, newLayer] });
    toast.success(`Duplicated "${sourceLayer.name}" to "${newLayer.name}"`);
  },

  selectLayer: (id) => {
    const { activeLayerId, nodes, edges, layers } = get();
    if (activeLayerId === id) return;

    const updatedLayers = layers.map((l) => {
      if (l.id === activeLayerId) {
        return { ...l, nodes, edges };
      }
      return l;
    });

    const target = updatedLayers.find((l) => l.id === id);
    if (!target) return;

    set({
      layers: updatedLayers,
      activeLayerId: id,
      nodes: target.nodes,
      edges: target.edges,
    });

    // Re-evaluate this layer's nodes so outputs broadcast from a multi-dimensional
    // node in another layer correctly propagate downstream in the newly active one.
    setTimeout(() => {
      for (const n of get().nodes) {
        get().evaluateNode(n.id);
      }
    }, 0);
  },
  
  deleteLayer: (id) => {
    const { activeLayerId, layers } = get();
    if (layers.length <= 1) {
      toast.error("Cannot delete the last remaining dimension!");
      return;
    }
    const filtered = layers.filter((l) => l.id !== id);
    
    if (activeLayerId === id) {
      const first = filtered[0];
      set({
        layers: filtered,
        activeLayerId: first.id,
        nodes: first.nodes,
        edges: first.edges,
      });
    } else {
      set({ layers: filtered });
    }
    toast.success("Dimension collapsed.");
  },
  
  setIsLayersViewOpen: (open) => {
    if (!open) {
      set({ isLayersViewOpen: false });
      return;
    }
    // Sync live canvas state into layers AND hubs before showing the stack, so
    // both the stack view and the federation view render fresh snapshots.
    const { liveLayers, hubs } = syncHubs(get());
    set({ layers: liveLayers, hubs, isLayersViewOpen: true });
  },
  
  toggleNodeMultiDimensional: (nodeId) => {
    const { nodes, activeLayerId } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const isCurrentlyMultiDim = !!node.data.config?.isMultiDimensional;

    if (!isCurrentlyMultiDim) {
      // Turning ON: stamp a shared id on this node and clone it into every other dimension.
      const sharedId = `shared_${nodeId}`;

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  config: {
                    ...n.data.config,
                    isMultiDimensional: true,
                    sharedId,
                    isMultiDimOrigin: true,
                    originLayerId: activeLayerId,
                  },
                },
              }
            : n
        ),
        layers: state.layers.map((l) => {
          if (l.id === activeLayerId) return l;
          if (l.nodes.some((n) => n.data.config?.sharedId === sharedId)) return l;
          const clone: Node<NodeData> = {
            ...node,
            id: `${node.id}_dim_${l.id}`,
            selected: false,
            data: {
              ...node.data,
              inputs: node.data.inputs.map((i) => ({ ...i })),
              outputs: node.data.outputs.map((o) => ({ ...o })),
              config: {
                ...node.data.config,
                isMultiDimensional: true,
                sharedId,
                isMultiDimOrigin: false,
                originLayerId: activeLayerId,
              },
            },
          };
          return { ...l, nodes: [...l.nodes, clone] };
        }),
      }));

      toast.success(`"${node.data.label}" is now synced across all dimensions`);
    } else {
      // Turning OFF: keep only the ORIGIN instance (wherever it lives) and remove
      // every clone — regardless of which instance's checkbox was actually clicked.
      const sharedId = node.data.config?.sharedId;
      const originLayerId = node.data.config?.originLayerId ?? activeLayerId;
      const isActiveLayerOrigin = originLayerId === activeLayerId;

      const clearFlags = (n: Node<NodeData>) => ({
        ...n,
        data: {
          ...n.data,
          config: {
            ...n.data.config,
            isMultiDimensional: false,
            sharedId: undefined,
            isMultiDimOrigin: false,
            originLayerId: undefined,
          },
        },
      });

      set((state) => {
        const layers = state.layers.map((l) => {
          if (l.id === activeLayerId || !sharedId) return l;
          if (l.id === originLayerId) {
            return {
              ...l,
              nodes: l.nodes.map((n) => (n.data.config?.sharedId === sharedId ? clearFlags(n) : n)),
            };
          }
          const removedIds = new Set(
            l.nodes.filter((n) => n.data.config?.sharedId === sharedId).map((n) => n.id)
          );
          if (removedIds.size === 0) return l;
          return {
            ...l,
            nodes: l.nodes.filter((n) => !removedIds.has(n.id)),
            edges: l.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
          };
        });

        if (isActiveLayerOrigin) {
          return {
            layers,
            nodes: state.nodes.map((n) => (n.id === nodeId ? clearFlags(n) : n)),
          };
        }

        // The active layer holds a clone, not the origin — drop this instance entirely.
        return {
          layers,
          nodes: state.nodes.filter((n) => n.id !== nodeId),
          edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        };
      });

      toast.success(`"${node.data.label}" now lives only in its original dimension`);
    }
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<NodeData>[],
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection) => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !sourceHandle || !target || !targetHandle) return;

    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === source);
    const targetNode = nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return;

    const sourcePort = sourceNode.data.outputs.find((o) => o.id === sourceHandle);
    const targetPort = targetNode.data.inputs.find((i) => i.id === targetHandle);
    if (!sourcePort || !targetPort) return;

    // Guardrail: Socket types must match (trigger to trigger, data to data)
    if (sourcePort.type !== targetPort.type) {
      toast.error(`Cannot connect execution flow to data value. Sockets must match: ${sourcePort.type} to ${targetPort.type}.`);
      return;
    }

    set((state) => {
      // Data inputs can only have at most one connection
      let filteredEdges = state.edges;
      if (targetPort.type === "data") {
        filteredEdges = state.edges.filter(
          (e) => !(e.target === target && e.targetHandle === targetHandle)
        );
      }

      const isTrigger = sourcePort.type === "trigger";
      const edgeColor = isTrigger 
        ? "#f59e0b" 
        : sourcePort.dataType === "number" 
        ? "#10b981" 
        : sourcePort.dataType === "boolean" 
        ? "#14b8a6" 
        : sourcePort.dataType === "string" 
        ? "#a78bfa" 
        : "#3b82f6";

      const connectionWithStyle = {
        ...connection,
        style: {
          stroke: edgeColor,
          strokeWidth: isTrigger ? 2.5 : 2,
        },
        animated: isTrigger,
      };

      const newEdges = addEdge(connectionWithStyle, filteredEdges);

      // Grow Formula-node inputs when their last free letter gets used
      const updatedNodes = state.nodes.map((n) => {
        if (n.id !== target) return n;
        return adjustFormulaInputs(n, newEdges) ?? n;
      });

      // Trigger evaluation downstream immediately when connected
      setTimeout(() => {
        get().evaluateNode(target);
      }, 0);

      return { edges: newEdges, nodes: updatedNodes };
    });
  },

  disconnectHandle: (nodeId, handleId, type) => {
    set((state) => {
      const edges = state.edges.filter((edge) => {
        if (type === "target") {
          return !(edge.target === nodeId && edge.targetHandle === handleId);
        } else {
          return !(edge.source === nodeId && edge.sourceHandle === handleId);
        }
      });
      const nodes = state.nodes.map((n) =>
        n.id === nodeId ? adjustFormulaInputs(n, edges) ?? n : n
      );
      return { edges, nodes };
    });
  },

  addNode: (type, x, y) => {
    const def = NODE_DEFINITIONS[type];
    if (!def) return;

    const id = `${type}_${Date.now()}`;
    const newNode: Node<NodeData> = {
      id,
      type,
      position: { x, y },
      data: {
        label: def.label,
        type: def.type,
        inputs: def.inputs.map((i) => ({ ...i })),
        outputs: def.outputs.map((o) => ({ ...o })),
        config: def.config ? JSON.parse(JSON.stringify(def.config)) : {},
        executionState: "idle",
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));

    // Trigger initial node evaluation
    setTimeout(() => {
      get().evaluateNode(id);
    }, 0);

    toast.success(`Added ${def.label}`);
  },

  deleteNode: (id) => {
    const { nodes } = get();
    const sharedId = nodes.find((n) => n.id === id)?.data.config?.sharedId;

    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      // Deleting a multi-dimensional node's origin also removes its clones everywhere else.
      layers: sharedId
        ? state.layers.map((l) => {
            const removedIds = new Set(
              l.nodes.filter((n) => n.data.config?.sharedId === sharedId).map((n) => n.id)
            );
            if (removedIds.size === 0) return l;
            return {
              ...l,
              nodes: l.nodes.filter((n) => !removedIds.has(n.id)),
              edges: l.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
            };
          })
        : state.layers,
    }));
    toast.success("Node deleted");
  },

  clearBoard: () => {
    set({ nodes: [], edges: [] });
    toast.success("Board cleared");
  },

  updateNodeConfig: (id, newConfig) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              config: { ...n.data.config, ...newConfig },
            },
          };
        }
        return n;
      }),
    }));

    // Re-evaluate node and its descendants
    setTimeout(() => {
      get().evaluateNode(id);
    }, 0);
  },

  updateNodeInputStaticValue: (nodeId, inputId, value) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) {
          const updatedInputs = n.data.inputs.map((input) => {
            if (input.id === inputId) {
              return { ...input, value };
            }
            return input;
          });
          return {
            ...n,
            data: { ...n.data, inputs: updatedInputs },
          };
        }
        return n;
      }),
    }));

    // Re-evaluate node when a static input changes
    setTimeout(() => {
      get().evaluateNode(nodeId);
    }, 0);
  },

  // Evaluate a node's output data variables reactively
  evaluateNode: (nodeId) => {
    const { nodes, edges, layers, activeLayerId } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const sharedId = node.data.config?.isMultiDimensional ? node.data.config?.sharedId : null;

    let outputs: Record<string, any> = {};
    let executionState: "idle" | "error" = "idle";
    let errorMessage: string | undefined = undefined;

    if (sharedId) {
      // Multi-dimensional node: gather this node's instance from every dimension
      // (the active layer's instance comes from live state, others from `layers`).
      const instances = layers
        .map((l) => {
          if (l.id === activeLayerId) {
            const instance = nodes.find((n) => n.data.config?.sharedId === sharedId);
            return instance ? { nodeList: nodes, edgeList: edges, instance } : null;
          }
          const instance = l.nodes.find((n) => n.data.config?.sharedId === sharedId);
          return instance ? { nodeList: l.nodes, edgeList: l.edges, instance } : null;
        })
        .filter((x): x is { nodeList: Node<NodeData>[]; edgeList: Edge[]; instance: Node<NodeData> } => !!x);

      // Combine each input port's value across every dimension's instance —
      // this is the "process as multiple inputs" step (sum numbers, OR booleans, etc.)
      const combinedInputs: Record<string, any> = {};
      for (const inputDef of node.data.inputs) {
        if (inputDef.type === "trigger") continue;
        const values = instances.map(({ instance, nodeList, edgeList }) =>
          resolveNodeInputs(instance, nodeList, edgeList)[inputDef.id]
        );
        combinedInputs[inputDef.id] = combineDimensionValues(values);
      }

      try {
        outputs = computeNodeOutputs(node.type || "", combinedInputs, node.data.config || {});
      } catch (err: any) {
        executionState = "error";
        errorMessage = err.message || "Evaluation error";
      }

      // Broadcast the single combined output onto every dimension's instance.
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.data.config?.sharedId === sharedId
            ? applyComputedOutputs(n, outputs, executionState, errorMessage)
            : n
        ),
        layers: state.layers.map((l) => {
          if (l.id === activeLayerId) return l;
          return {
            ...l,
            nodes: l.nodes.map((n) =>
              n.data.config?.sharedId === sharedId
                ? applyComputedOutputs(n, outputs, executionState, errorMessage)
                : n
            ),
          };
        }),
      }));
    } else {
      const inputs = resolveNodeInputs(node, nodes, edges);

      try {
        outputs = computeNodeOutputs(node.type || "", inputs, node.data.config || {});
      } catch (err: any) {
        executionState = "error";
        errorMessage = err.message || "Evaluation error";
      }

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? applyComputedOutputs(n, outputs, executionState, errorMessage) : n
        ),
      }));
    }

    // Propagate to downstream data nodes within the active layer
    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      const sourcePort = node.data.outputs.find((o) => o.id === edge.sourceHandle);
      if (sourcePort && sourcePort.type === "data") {
        get().evaluateNode(edge.target);
      }
    }
  },

  // Propagates trigger commands through trigger connection lines
  triggerNode: async (nodeId, outputPortId) => {
    const { edges, nodes } = get();

    // Find the edge originating from this node's trigger port
    const triggerEdge = edges.find(
      (e) => e.source === nodeId && e.sourceHandle === outputPortId
    );
    if (!triggerEdge) return;

    const targetNodeId = triggerEdge.target;
    const targetPortId = triggerEdge.targetHandle;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    // 1. Indicate the node is processing/running
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === targetNodeId
          ? {
              ...n,
              data: { ...n.data, executionState: "running" as const },
            }
          : n
      ),
    }));

    // Give visual animation a moment
    await new Promise((r) => setTimeout(r, get().stepDelayMs));

    // 2. Refresh inputs on target node
    get().evaluateNode(targetNodeId);

    // Fetch the updated node state
    const currentNodes = get().nodes;
    const currentTargetNode = currentNodes.find((n) => n.id === targetNodeId)!;

    let nextTriggerPort: string | null = null;
    let status: "success" | "error" = "success";
    let errorMsg = "";

    try {
      // Gather current input port values
      const inputs: Record<string, any> = {};
      for (const input of currentTargetNode.data.inputs) {
        const edge = edges.find(
          (e) => e.target === targetNodeId && e.targetHandle === input.id
        );
        if (edge) {
          const sourceNode = currentNodes.find((n) => n.id === edge.source);
          const sourcePort = sourceNode?.data.outputs.find(
            (o) => o.id === edge.sourceHandle
          );
          inputs[input.id] = sourcePort ? sourcePort.value : input.value;
        } else {
          inputs[input.id] = input.value;
        }
      }

      // Publishes a loop counter onto the loop node's config + outputs and
      // re-evaluates so downstream data consumers see the fresh value.
      const publishLoopValue = (key: string, value: number) => {
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === targetNodeId
              ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
              : n
          ),
        }));
        get().evaluateNode(targetNodeId);
      };

      if (currentTargetNode.type === "forLoopNode") {
        const count = Math.max(0, Math.min(1000, Number(inputs.count ?? 3)));
        for (let i = 0; i < count; i++) {
          publishLoopValue("index", i);
          await get().triggerNode(targetNodeId, "loopBody");
        }
        nextTriggerPort = "done";
      } else if (currentTargetNode.type === "whileLoopNode") {
        const condEdge = get().edges.find(
          (e) => e.target === targetNodeId && e.targetHandle === "condition"
        );
        let iteration = 0;
        while (iteration < 1000) {
          publishLoopValue("iteration", iteration);
          // Re-evaluate the condition's upstream chain each pass — the loop
          // body may have changed the values feeding it (e.g. a counter).
          let condVal: any;
          if (condEdge) {
            get().evaluateNode(condEdge.source);
            const srcNode = get().nodes.find((n) => n.id === condEdge.source);
            condVal = srcNode?.data.outputs.find((o) => o.id === condEdge.sourceHandle)?.value;
          } else {
            condVal = get()
              .nodes.find((n) => n.id === targetNodeId)
              ?.data.inputs.find((i) => i.id === "condition")?.value;
          }
          if (!resolveConditionFlag(condVal)) break;
          await get().triggerNode(targetNodeId, "loopBody");
          iteration++;
        }
        if (iteration >= 1000) {
          toast.error("While Loop stopped: 1000-iteration safety cap reached");
        }
        nextTriggerPort = "done";
      } else {
        // Handle operations triggered by execution flow using the execution helper
        const triggerRes = await handleTriggerOperation(
          currentTargetNode.type || "",
          inputs,
          currentTargetNode.data.config || {},
          targetPortId || ""
        );
        nextTriggerPort = triggerRes.nextTriggerPort;

        if (triggerRes.updatedConfig) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id === targetNodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    config: triggerRes.updatedConfig,
                  },
                };
              }
              return n;
            }),
          }));
        }

        if (currentTargetNode.type === "counterNode") {
          get().evaluateNode(targetNodeId);
        }
      }
    } catch (err: any) {
      status = "error";
      errorMsg = err.message || "Execution flow error";
    }

    // 3. Mark execution status
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === targetNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                executionState: status,
                errorMessage: errorMsg || undefined,
                lastExecuted: new Date().toISOString(),
              },
            }
          : n
      ),
    }));

    // Trigger downstream evaluations
    get().evaluateNode(targetNodeId);

    // Call next trigger node in sequence if valid
    if (nextTriggerPort && status === "success") {
      await get().triggerNode(targetNodeId, nextTriggerPort);
    }
  },

  runAll: async () => {
    if (get().isRunning) return;
    set({ isRunning: true });
    
    const { runLoops, stepDelayMs } = get();
    const loopsCount = runLoops || 1;
    
    const toastId = toast.loading(`Starting execution loop (0/${loopsCount})...`);
    get().resetExecutionStates();

    try {
      for (let i = 0; i < loopsCount; i++) {
        if (loopsCount > 1) {
          toast.loading(`Executing loop (${i + 1}/${loopsCount})...`, { id: toastId });
        }
        
        // Save current canvas layout to layers slot before compiling
        const { activeLayerId, nodes, edges, layers } = get();
        const currentLayers = layers.map((l) => {
          if (l.id === activeLayerId) {
            return { ...l, nodes, edges };
          }
          return l;
        });

        const response = await fetch("http://localhost:8000/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activeLayerId,
            layers: currentLayers,
          }),
        });

        if (!response.ok) {
          let errorDetail = response.statusText;
          try {
            const errJson = await response.json();
            if (errJson && errJson.detail) {
              errorDetail = errJson.detail;
            }
          } catch {
            // ignore parsing error
          }
          throw new Error(`FastAPI Server error: ${errorDetail}`);
        }

        const res = await response.json();
        console.log("[Execution Result]", res);

        if (res.success) {
          // Update outputs and inputs across ALL dimension slots
          set((state) => {
            const updateLayerNodes = (layerNodes: Node<NodeData>[]) => {
              return layerNodes.map((n) => {
                const nodeOutputs = res.outputs[n.id];
                let updatedOutputs = n.data.outputs;
                if (nodeOutputs) {
                  updatedOutputs = n.data.outputs.map((outPort) => {
                    if (nodeOutputs[outPort.id] !== undefined) {
                      return { ...outPort, value: nodeOutputs[outPort.id] };
                    }
                    return outPort;
                  });
                }

                const updatedConfig = { ...n.data.config };
                if (n.type === "loggerNode" && nodeOutputs && nodeOutputs.logs) {
                  updatedConfig.logs = nodeOutputs.logs;
                }
                if (n.type === "counterNode" && nodeOutputs && nodeOutputs.count !== undefined) {
                  updatedConfig.count = nodeOutputs.count;
                }

                return {
                  ...n,
                  data: {
                    ...n.data,
                    outputs: updatedOutputs,
                    config: updatedConfig,
                    executionState: nodeOutputs ? ("success" as const) : n.data.executionState,
                    errorMessage: undefined,
                    lastExecuted: nodeOutputs ? new Date().toISOString() : n.data.lastExecuted,
                  },
                };
              });
            };

            const updateLayerEdges = (layerEdges: Edge[], layerNodes: Node<NodeData>[]) => {
              return layerEdges.map((edge) => {
                const sourceNode = layerNodes.find((ln) => ln.id === edge.source);
                if (!sourceNode || sourceNode.data.executionState !== "success") {
                  return {
                    ...edge,
                    label: undefined,
                    style: {
                      ...edge.style,
                      strokeWidth: 2,
                      opacity: 0.25,
                    },
                  };
                }

                const isTrigger = edge.sourceHandle?.endsWith("Trigger") || 
                                  edge.sourceHandle === "triggerOut" || 
                                  edge.sourceHandle === "outTrigger" || 
                                  edge.sourceHandle === "onTrue" || 
                                  edge.sourceHandle === "onFalse";

                if (isTrigger) {
                  return {
                    ...edge,
                    animated: true,
                    style: {
                      stroke: "#f59e0b",
                      strokeWidth: 3,
                      opacity: 1.0,
                    },
                  };
                }

                const outPort = sourceNode.data.outputs.find((o) => o.id === edge.sourceHandle);
                const val = outPort?.value;
                const portColor = getPortColor("data", outPort?.dataType);

                return {
                  ...edge,
                  label: val !== undefined ? formatEdgeValue(val) : undefined,
                  labelBgStyle: { fill: "#18181b", stroke: "#27272a", fillOpacity: 0.95, rx: 4 },
                  labelStyle: { fill: portColor, fontSize: 9, fontFamily: "Outfit", fontWeight: "bold" },
                  style: {
                    stroke: portColor,
                    strokeWidth: 3,
                    opacity: 1.0,
                  },
                };
              });
            };

            const updateLayerInputs = (layerNodes: Node<NodeData>[], layerEdges: Edge[]) => {
              return layerNodes.map((n) => {
                const updatedInputs = n.data.inputs.map((inPort) => {
                  if (inPort.type === "trigger") return inPort;
                  const incoming = layerEdges.find((e) => e.target === n.id && e.targetHandle === inPort.id);
                  if (incoming && incoming.sourceHandle) {
                    // Direct backend output lookup fallback
                    const directVal = res.outputs[incoming.source]?.[incoming.sourceHandle];
                    if (directVal !== undefined) {
                      return { ...inPort, value: directVal };
                    }

                    const srcNode = layerNodes.find((sn) => sn.id === incoming.source);
                    if (srcNode) {
                      const srcOut = srcNode.data.outputs.find((o) => o.id === incoming.sourceHandle);
                      if (srcOut && srcOut.value !== undefined) {
                        return { ...inPort, value: srcOut.value };
                      }
                    }
                  }
                  return inPort;
                });

                return {
                  ...n,
                  data: {
                    ...n.data,
                    inputs: updatedInputs,
                  },
                };
              });
            };

            // 1. Process active nodes
            const updatedActiveNodesOutputs = updateLayerNodes(state.nodes);
            const updatedActiveEdges = updateLayerEdges(state.edges, updatedActiveNodesOutputs);
            const updatedActiveNodes = updateLayerInputs(updatedActiveNodesOutputs, updatedActiveEdges);

            // 2. Process all dimensions
            const updatedLayers = state.layers.map((layer) => {
              if (layer.id === state.activeLayerId) {
                return { ...layer, nodes: updatedActiveNodes, edges: updatedActiveEdges };
              }
              const layerNodesOutputs = updateLayerNodes(layer.nodes);
              const layerEdges = updateLayerEdges(layer.edges, layerNodesOutputs);
              const layerNodes = updateLayerInputs(layerNodesOutputs, layerEdges);
              return { ...layer, nodes: layerNodes, edges: layerEdges };
            });

            return {
              nodes: updatedActiveNodes,
              edges: updatedActiveEdges,
              layers: updatedLayers,
            };
          });
        } else {
          throw new Error(res.error || "Compilation failed");
        }

        // Sleep between loops if loopsCount > 1
        if (i < loopsCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(100, stepDelayMs)));
        }
      }

      toast.dismiss(toastId);
      toast.success(loopsCount > 1 ? `Completed ${loopsCount} loops successfully!` : "LangGraph execution completed successfully!");
      console.log("=== LangGraph Execution Completed ===");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`LangGraph run failed: ${err.message}. Make sure Python FastAPI is running on port 8000.`);
      
      // Update execution state to error for all nodes
      set((state) => ({
        nodes: state.nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            executionState: "error" as const,
            errorMessage: err.message,
          },
        })),
      }));
    } finally {
      set({ isRunning: false });
    }
  },

  resetExecutionStates: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionState: "idle",
          errorMessage: undefined,
          // If it is a logger, we can clear the logs or preserve them. Let's preserve but reset status.
        },
      })),
    }));
  },

  saveToFile: () => {
    const state = get();
    const { liveLayers, hubs } = syncHubs(state);

    const filePayload = JSON.stringify({
      version: 2,
      activeHubId: state.activeHubId,
      hubs,
      // Legacy fields so older builds can still open the active hub
      activeLayerId: state.activeLayerId,
      layers: liveLayers,
    }, null, 2);

    const blob = new Blob([filePayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logiboard_layers_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("All dimensions saved successfully");
  },

  loadFromFile: (jsonContent) => {
    try {
      const data = JSON.parse(jsonContent);
      if (data.hubs && Array.isArray(data.hubs) && data.hubs.length > 0) {
        // v2 federation format
        const activeHub =
          data.hubs.find((h: any) => h.id === data.activeHubId) || data.hubs[0];
        const activeLayer =
          activeHub.layers?.find((l: any) => l.id === activeHub.activeLayerId) ||
          activeHub.layers?.[0];
        set({
          hubs: data.hubs,
          activeHubId: activeHub.id,
          layers: activeHub.layers || [],
          activeLayerId: activeLayer?.id || "",
          nodes: activeLayer?.nodes || [],
          edges: activeLayer?.edges || [],
        });
      } else if (data.layers && Array.isArray(data.layers)) {
        const active = data.activeLayerId || data.layers[0]?.id;
        const activeLayer = data.layers.find((l: any) => l.id === active) || data.layers[0];

        set({
          hubs: [{ id: "hub_default", name: "Hub Prime", layers: data.layers, activeLayerId: active }],
          activeHubId: "hub_default",
          layers: data.layers,
          activeLayerId: active,
          nodes: activeLayer?.nodes || [],
          edges: activeLayer?.edges || []
        });
      } else {
        // Fallback loading format (legacy single layer)
        const nodes = data.nodes || [];
        const edges = data.edges || [];
        const layers = [{ id: "layer_default", name: "Dimension Alpha", nodes, edges }];
        set({
          hubs: [{ id: "hub_default", name: "Hub Prime", layers, activeLayerId: "layer_default" }],
          activeHubId: "hub_default",
          layers,
          activeLayerId: "layer_default",
          nodes,
          edges
        });
      }

      setTimeout(() => {
        const currentNodes = get().nodes;
        for (const n of currentNodes) {
          get().evaluateNode(n.id);
        }
      }, 50);
      toast.success("Algorithm loaded successfully");
    } catch (err: any) {
      toast.error(`Failed to load algorithm: ${err.message}`);
    }
  },
}));
