export type {
  SocketType,
  SocketDataType,
  PortDefinition,
  ExecutionState,
  NodeData,
  NodeDefinition,
} from "./node-definitions/base";

import type { NodeDefinition } from "./node-definitions/base";
import { INPUT_NODES } from "./node-definitions/inputs";
import { LOGIC_NODES } from "./node-definitions/logic";
import { CONTROL_FLOW_NODES } from "./node-definitions/control-flow";
import { MATH_COMPARE_NODES } from "./node-definitions/math-compare";
import { DATA_TEXT_NODES } from "./node-definitions/data-text";
import { OUTPUT_NODES } from "./node-definitions/outputs";
import { AI_SCRIPT_NODES } from "./node-definitions/ai-scripts";
import { NEURAL_NETWORK_NODES } from "./node-definitions/neural-network";
import { AI_MODEL_NODES } from "./node-definitions/ai-model";

export const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
  ...INPUT_NODES,
  ...LOGIC_NODES,
  ...CONTROL_FLOW_NODES,
  ...MATH_COMPARE_NODES,
  ...DATA_TEXT_NODES,
  ...OUTPUT_NODES,
  ...AI_SCRIPT_NODES,
  ...NEURAL_NETWORK_NODES,
  ...AI_MODEL_NODES,
};
