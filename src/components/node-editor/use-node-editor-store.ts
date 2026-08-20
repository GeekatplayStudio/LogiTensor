import { create } from "zustand";
import { logEvent } from "@/lib/debug-log";
import { NodeEditorState } from "./store/types";
import { createGraphSlice } from "./store/graph-slice";
import { createLayersSlice } from "./store/layers-slice";
import { createHubsSlice } from "./store/hubs-slice";
import { createExecutionSlice } from "./store/execution-slice";
import { createPersistenceSlice } from "./store/persistence-slice";
import { createDeviceSlice } from "./store/device-slice";

export type { Layer, Hub } from "./store/types";

export const useNodeEditorStore = create<NodeEditorState>((set, get) => {
  // First line in the terminal, so the session always has a visible origin.
  logEvent("debug", "system", "Node editor store initialized");
  return {
    ...createGraphSlice(set, get),
    ...createLayersSlice(set, get),
    ...createHubsSlice(set, get),
    ...createExecutionSlice(set, get),
    ...createPersistenceSlice(set, get),
    ...createDeviceSlice(set),
    // Generated test file pane — small enough to live inline (see types.ts).
    testPanel: null,
    setTestPanel: (content) => set({ testPanel: content }),
  };
});
