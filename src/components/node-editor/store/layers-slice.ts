import { StoreApi } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "@/types/nodes";
import { toast } from "sonner";
import { logEvent } from "@/lib/debug-log";
import { Layer, NodeEditorState } from "./types";
import { cloneLayerContents, syncHubs, uniqueId } from "./graph-helpers";

type Setter = StoreApi<NodeEditorState>["setState"];
type Getter = StoreApi<NodeEditorState>["getState"];

export const createLayersSlice = (set: Setter, get: Getter) => ({
  // Layers state
  layers: [{ id: "layer_default", name: "Dimension Alpha", nodes: [], edges: [] }] as Layer[],
  activeLayerId: "layer_default",
  isLayersViewOpen: false,

  renameLayer: (id: string, name: string) => {
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    }));
  },

  addLayer: () => {
    const id = uniqueId("layer");
    const count = get().layers.length + 1;
    const name = `Dimension ${String.fromCharCode(64 + count)}`; // Dimension B, C, etc.
    const newLayer: Layer = { id, name, nodes: [], edges: [] };
    set((state) => ({ layers: [...state.layers, newLayer] }));
    toast.success(`Created ${name}`);
    logEvent("info", "graph", `Dimension created: ${name}`, `id: ${id}`);
  },

  duplicateLayer: (id: string) => {
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
    logEvent("info", "graph", `Dimension duplicated: "${sourceLayer.name}" → "${newLayer.name}"`, `${cloned.nodes.length} node(s), ${cloned.edges.length} edge(s)`);
  },

  selectLayer: (id: string) => {
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

    logEvent("info", "graph", `Switched to dimension "${target.name}"`, `${target.nodes.length} node(s), ${target.edges.length} edge(s)`);

    // Re-evaluate this layer's nodes so outputs broadcast from a multi-dimensional
    // node in another layer correctly propagate downstream in the newly active one.
    setTimeout(() => {
      for (const n of get().nodes) {
        get().evaluateNode(n.id);
      }
    }, 0);
  },

  deleteLayer: (id: string) => {
    const { activeLayerId, layers } = get();
    if (layers.length <= 1) {
      toast.error("Cannot delete the last remaining dimension!");
      logEvent("warn", "graph", "Refused to delete the last remaining dimension");
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
    logEvent("info", "graph", `Dimension deleted: ${layers.find((l) => l.id === id)?.name ?? id}`);
  },

  setIsLayersViewOpen: (open: boolean) => {
    if (!open) {
      set({ isLayersViewOpen: false });
      return;
    }
    // Sync live canvas state into layers AND hubs before showing the stack, so
    // both the stack view and the federation view render fresh snapshots.
    const { liveLayers, hubs } = syncHubs(get());
    set({ layers: liveLayers, hubs, isLayersViewOpen: true });
  },

  toggleNodeMultiDimensional: (nodeId: string) => {
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
});
