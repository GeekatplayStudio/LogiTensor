import type { NodeDefinition } from "./base";

export const OUTPUT_NODES: Record<string, NodeDefinition> = {
  loggerNode: {
    type: "loggerNode",
    label: "Console Logger",
    category: "Outputs",
    description: "Logs the input value when the trigger signal is fired.",
    inputs: [
      { id: "inTrigger", name: "Log", type: "trigger" },
      { id: "value", name: "Value", type: "data", dataType: "any", value: "log me" },
    ],
    outputs: [{ id: "outTrigger", name: "Out", type: "trigger" }],
    config: { logs: [] as string[] },
  },
  textOutputNode: {
    type: "textOutputNode",
    label: "Text Output",
    category: "Outputs",
    description: "Displays any incoming data value as scrollable, resizable text.",
    inputs: [
      { id: "inTrigger", name: "In", type: "trigger" },
      { id: "value", name: "Value", type: "data", dataType: "any", value: "" },
    ],
    outputs: [{ id: "outTrigger", name: "Out", type: "trigger" }],
  },
  assertNode: {
    type: "assertNode",
    label: "Expected Value",
    category: "Outputs",
    description: "Passes (green) when Value equals Expected — the assertion node for visual run-through tests (fired by Run Tests).",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: 0 },
      { id: "expected", name: "Expected", type: "data", dataType: "any", value: 0 },
    ],
    outputs: [{ id: "pass", name: "Pass", type: "data", dataType: "boolean" }],
  },
};
