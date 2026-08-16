import { StoreApi } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "@/types/nodes";
import { toast } from "sonner";
import { Hub, NodeEditorState } from "./types";
import { cloneLayerContents, syncHubs, uniqueId } from "./graph-helpers";

type Setter = StoreApi<NodeEditorState>["setState"];
type Getter = StoreApi<NodeEditorState>["getState"];

export const createHubsSlice = (set: Setter, get: Getter) => ({
  // Federation state
  hubs: [
    {
      id: "hub_default",
      name: "Hub Prime",
      layers: [{ id: "layer_default", name: "Dimension Alpha", nodes: [], edges: [] }],
      activeLayerId: "layer_default",
    },
  ] as Hub[],
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

  duplicateHub: (id: string) => {
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

  deleteHub: (id: string) => {
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

  selectHub: (id: string) => {
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

  renameHub: (id: string, name: string) => {
    set((state) => ({
      hubs: state.hubs.map((h) => (h.id === id ? { ...h, name } : h)),
    }));
  },

  toggleNodeFederated: (nodeId: string) => {
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
});
