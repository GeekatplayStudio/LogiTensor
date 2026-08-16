import type { NodeDefinition } from "./base";
import { ENABLED_INPUT } from "./base";

export const LOGIC_NODES: Record<string, NodeDefinition> = {
  andGate: {
    type: "andGate",
    label: "AND Gate",
    category: "Logic",
    description: "Logical AND operation. True only if both inputs are true.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: true },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: true },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  orGate: {
    type: "orGate",
    label: "OR Gate",
    category: "Logic",
    description: "Logical OR operation. True if at least one input is true.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: false },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: false },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  notGate: {
    type: "notGate",
    label: "NOT Gate",
    category: "Logic",
    description: "Logical NOT operation. Inverts the input boolean value.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: false },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  xorGate: {
    type: "xorGate",
    label: "XOR Gate",
    category: "Logic",
    description: "Logical XOR operation. True if inputs are different.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: false },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: false },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  norGate: {
    type: "norGate",
    label: "NOR Gate",
    category: "Logic",
    description: "Logical NOR operation. True only if both inputs are false.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: false },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: false },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  nandGate: {
    type: "nandGate",
    label: "NAND Gate",
    category: "Logic",
    description: "Logical NAND operation. False only if both inputs are true.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: true },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: true },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  xnorGate: {
    type: "xnorGate",
    label: "XNOR Gate",
    category: "Logic",
    description: "Logical XNOR operation. True if both inputs are the same.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: false },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: false },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  toggleNode: {
    type: "toggleNode",
    label: "Toggle",
    category: "Logic",
    description: "Flips a stored boolean every time it is triggered (a flip-flop switch).",
    inputs: [
      { id: "inTrigger", name: "Flip", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "state", name: "State", type: "data", dataType: "boolean" },
    ],
    config: { state: false },
  },
  latchNode: {
    type: "latchNode",
    label: "SR Latch",
    category: "Logic",
    description: "Set/Reset latch: Set holds the state true, Reset holds it false, until the other fires.",
    inputs: [
      { id: "setTrigger", name: "Set", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "state", name: "State", type: "data", dataType: "boolean" },
    ],
    config: { state: false },
  },
};
