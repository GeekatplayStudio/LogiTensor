import { StoreApi } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Edge,
  Node,
} from "@xyflow/react";
import { NodeData, NODE_DEFINITIONS } from "@/types/nodes";
import { idleEdgeStyle } from "@/lib/edge-styles";
import { toast } from "sonner";
import { NodeEditorState } from "./types";
import { adjustFormulaInputs, nextUniqueIdSuffix, uniqueId } from "./graph-helpers";

type Setter = StoreApi<NodeEditorState>["setState"];
type Getter = StoreApi<NodeEditorState>["getState"];

// Clipboard for node copy/paste (Ctrl/Cmd+C / Ctrl/Cmd+V). Lives outside the
// store since it's a transient, non-reactive scratch buffer — no component
// needs to re-render off it.
let nodeClipboard: { nodes: Node<NodeData>[]; edges: Edge[] } | null = null;

export const createGraphSlice = (set: Setter, get: Getter) => ({
  nodes: [] as Node<NodeData>[],
  edges: [] as Edge[],
  isRunning: false,
  stepDelayMs: 300,
  setStepDelayMs: (delay: number) => set({ stepDelayMs: delay }),
  runLoops: 1,
  setRunLoops: (loops: number) => set({ runLoops: loops }),

  onNodesChange: (changes: Parameters<NodeEditorState["onNodesChange"]>[0]) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<NodeData>[],
    }));
  },

  onEdgesChange: (changes: Parameters<NodeEditorState["onEdgesChange"]>[0]) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection: Parameters<NodeEditorState["onConnect"]>[0]) => {
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
    // — except a boolean/number/any data output may also drive a trigger
    // input directly (see the rising-edge firing logic in evaluateNode).
    const isHybridTrigger =
      targetPort.type === "trigger" &&
      sourcePort.type === "data" &&
      (sourcePort.dataType === "boolean" || sourcePort.dataType === "number" || sourcePort.dataType === "any");

    if (sourcePort.type !== targetPort.type && !isHybridTrigger) {
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

      // New connections start dim/idle — they only "light up" once a value
      // or trigger has actually flowed through them.
      const connectionWithStyle = {
        ...connection,
        style: idleEdgeStyle(isTrigger ? 2.5 : 2),
        animated: false,
      };

      const newEdges = addEdge(connectionWithStyle, filteredEdges);

      // Grow Formula-node inputs when their last free letter gets used
      const updatedNodes = state.nodes.map((n) => {
        if (n.id !== target) return n;
        return adjustFormulaInputs(n, newEdges) ?? n;
      });

      // Trigger evaluation downstream immediately when connected. For a
      // hybrid data->trigger edge, the rising-edge check that decides
      // whether to fire lives in the SOURCE node's downstream loop (target
      // trigger inputs are never resolved as data) — so the source must be
      // re-evaluated too, or a wire connected while already "on" (e.g. a
      // Range output that's already true) would silently never fire until
      // something unrelated happened to re-evaluate it.
      setTimeout(() => {
        if (isHybridTrigger) get().evaluateNode(source);
        get().evaluateNode(target);
      }, 0);

      return { edges: newEdges, nodes: updatedNodes };
    });
  },

  disconnectHandle: (nodeId: string, handleId: string, type: "source" | "target") => {
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
      // Forget any remembered on/off state for this input so a future
      // reconnect of an already-"on" source can fire again (a no-op unless
      // this was a hybrid data->trigger port).
      let dataTriggerState = state.dataTriggerState;
      if (type === "target") {
        dataTriggerState = { ...dataTriggerState };
        delete dataTriggerState[`${nodeId}:${handleId}`];
      }
      return { edges, nodes, dataTriggerState };
    });
  },

  addNode: (type: string, x: number, y: number) => {
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

  deleteNode: (id: string) => {
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

  deleteSelectedNodes: () => {
    const selectedIds = get().nodes.filter((n) => n.selected).map((n) => n.id);
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => get().deleteNode(id));
  },

  copySelectedNodes: () => {
    const { nodes, edges } = get();
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));
    // Only bring along edges wired entirely within the copied selection —
    // an edge to a node left behind would dangle after paste.
    const internalEdges = edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target));
    nodeClipboard = {
      nodes: selected.map((n) => ({ ...n, data: { ...n.data } })),
      edges: internalEdges.map((e) => ({ ...e })),
    };
    toast.success(`Copied ${selected.length} node${selected.length > 1 ? "s" : ""}`);
  },

  pasteClipboard: () => {
    if (!nodeClipboard || nodeClipboard.nodes.length === 0) return;
    const idMap = new Map<string, string>();
    const pastedNodes = nodeClipboard.nodes.map((n) => {
      const newId = `${n.type}_${Date.now()}_${nextUniqueIdSuffix()}`;
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        selected: true,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        data: {
          ...n.data,
          executionState: "idle" as const,
          errorMessage: undefined,
        },
      };
    });
    const pastedEdges = nodeClipboard.edges.map((e, idx) => ({
      ...e,
      id: uniqueId(`edge_${idx}`),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
      selected: false,
    }));

    set((state) => ({
      nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), ...pastedNodes],
      edges: [...state.edges, ...pastedEdges],
    }));

    pastedNodes.forEach((n) => {
      setTimeout(() => get().evaluateNode(n.id), 0);
    });
    toast.success(`Pasted ${pastedNodes.length} node${pastedNodes.length > 1 ? "s" : ""}`);
  },

  clearBoard: () => {
    set({ nodes: [], edges: [] });
    toast.success("Board cleared");
  },

  updateNodeConfig: (id: string, newConfig: Record<string, any>) => {
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

  updateNodeInputStaticValue: (nodeId: string, inputId: string, value: any) => {
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
});
