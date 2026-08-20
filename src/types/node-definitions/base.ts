export type SocketType = "trigger" | "data";
export type SocketDataType = "number" | "boolean" | "string" | "any";

export interface PortDefinition {
  id: string; // unique within the node (e.g. 'a', 'b', 'out', 'triggerIn')
  name: string; // display name (e.g. 'A', 'B', 'Output', 'Run')
  type: SocketType;
  dataType?: SocketDataType;
  value?: any; // default static value if not connected (used for inputs)
}

export type ExecutionState = "idle" | "running" | "success" | "error";

export interface NodeData extends Record<string, any> {
  label: string;
  type: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  config?: Record<string, any>;
  executionState?: ExecutionState;
  errorMessage?: string;
  lastExecuted?: string; // timestamp
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: "Inputs" | "Logic" | "Control Flow" | "Math & Compare" | "Data & Text" | "Lists" | "Outputs" | "AI & Scripts" | "Neural Network" | "AI Model" | "Device Lab";
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  config?: Record<string, any>;
}

// Appended to any node that supports the Enabled bypass: when wired/set to
// false, the node skips its computation and passes its primary input straight
// to its primary output instead (see BYPASS_PORTS in execution-helpers.ts and
// its Python mirror in execution_engine.py).
export const ENABLED_INPUT: PortDefinition = { id: "enabled", name: "Enabled", type: "data", dataType: "boolean", value: true };
