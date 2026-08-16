import type { NodeDefinition } from "./base";

export const INPUT_NODES: Record<string, NodeDefinition> = {
  triggerInput: {
    type: "triggerInput",
    label: "Manual Trigger",
    category: "Inputs",
    description: "Manual trigger button to start execution paths.",
    inputs: [],
    outputs: [{ id: "triggerOut", name: "Trigger", type: "trigger" }],
  },
  constNum: {
    type: "constNum",
    label: "Constant Number",
    category: "Inputs",
    description: "Outputs a constant numerical value.",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "data", dataType: "number" }],
    config: { value: 5 },
  },
  constBool: {
    type: "constBool",
    label: "Constant Boolean",
    category: "Inputs",
    description: "Outputs a true/false value.",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "data", dataType: "boolean" }],
    config: { value: true },
  },
  constString: {
    type: "constString",
    label: "Constant String",
    category: "Inputs",
    description: "Outputs a text value.",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "data", dataType: "string" }],
    config: { value: "hello" },
  },
};
