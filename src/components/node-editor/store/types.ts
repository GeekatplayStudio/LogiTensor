import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from "@xyflow/react";
import { NodeData } from "@/types/nodes";

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

export interface NodeEditorState {
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
  deleteSelectedNodes: () => void;
  copySelectedNodes: () => void;
  pasteClipboard: () => void;
  clearBoard: () => void;
  updateNodeConfig: (id: string, config: Record<string, any>) => void;
  updateNodeInputStaticValue: (nodeId: string, inputId: string, value: any) => void;

  // Execution Engine
  evaluateNode: (nodeId: string) => void;
  triggerNode: (nodeId: string, outputPortId: string) => Promise<void>;
  // Fires a trigger input port directly (no trigger edge required) — used
  // when a boolean/number data wire lands on a trigger port and rises from
  // off to on. Keyed `${nodeId}:${portId}` in dataTriggerState below.
  fireTriggerInput: (nodeId: string, portId: string) => Promise<void>;
  dataTriggerState: Record<string, boolean>;
  runAll: () => Promise<void>;
  // Step-through debugging: while paused, every trigger hop waits for either
  // Resume or a single Step (see pauseGate in execution-slice.ts).
  isPaused: boolean;
  stepRequested: boolean;
  setIsPaused: (paused: boolean) => void;
  stepOnce: () => void;
  // Debugger breakpoints, keyed by node id. A plain record (rather than a Set)
  // so it survives JSON serialization and plays well with shallow comparison
  // in selectors.
  breakpoints: Record<string, true>;
  toggleBreakpoint: (nodeId: string) => void;
  clearBreakpoints: () => void;
  // Visual run-through testing: fires all Manual Triggers, then reports every
  // Expected Value node's verdict.
  runTests: () => Promise<void>;
  resetExecutionStates: () => void;

  // Serialization
  saveToFile: () => void;
  loadFromFile: (jsonContent: string) => void;
}
