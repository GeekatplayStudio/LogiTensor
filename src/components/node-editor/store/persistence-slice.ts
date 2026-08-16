import { StoreApi } from "zustand";
import { toast } from "sonner";
import { logEvent } from "@/lib/debug-log";
import { NodeEditorState } from "./types";
import { syncHubs } from "./graph-helpers";

type Setter = StoreApi<NodeEditorState>["setState"];
type Getter = StoreApi<NodeEditorState>["getState"];

export const createPersistenceSlice = (set: Setter, get: Getter) => ({
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
    link.download = `logitensor_layers_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("All dimensions saved successfully");
    logEvent(
      "success",
      "io",
      `Saved ${link.download}`,
      `${hubs.length} hub(s), ${liveLayers.length} dimension(s), ${state.nodes.length} node(s), ${state.edges.length} edge(s)`
    );
  },

  loadFromFile: (jsonContent: string) => {
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
      const loaded = get();
      toast.success("Algorithm loaded successfully");
      logEvent(
        "success",
        "io",
        "Algorithm loaded",
        `${loaded.hubs.length} hub(s), ${loaded.layers.length} dimension(s), ${loaded.nodes.length} node(s), ${loaded.edges.length} edge(s)`
      );
    } catch (err: any) {
      toast.error(`Failed to load algorithm: ${err.message}`);
      logEvent("error", "io", "Failed to load algorithm", err?.message ?? String(err));
    }
  },
});
