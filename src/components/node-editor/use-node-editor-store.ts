import { create } from "zustand";
import { NodeEditorState } from "./store/types";
import { createGraphSlice } from "./store/graph-slice";
import { createLayersSlice } from "./store/layers-slice";
import { createHubsSlice } from "./store/hubs-slice";
import { createExecutionSlice } from "./store/execution-slice";
import { createPersistenceSlice } from "./store/persistence-slice";

export type { Layer, Hub } from "./store/types";

export const useNodeEditorStore = create<NodeEditorState>((set, get) => ({
  ...createGraphSlice(set, get),
  ...createLayersSlice(set, get),
  ...createHubsSlice(set, get),
  ...createExecutionSlice(set, get),
  ...createPersistenceSlice(set, get),
}));
