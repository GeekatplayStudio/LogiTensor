import type { NodeDefinition } from "./base";

export const CONTROL_FLOW_NODES: Record<string, NodeDefinition> = {
  ifElseTrigger: {
    type: "ifElseTrigger",
    label: "If / Else Trigger",
    category: "Control Flow",
    description: "Checks Condition (true/false, an expression like a > b, or a wired boolean) and fires If or Else.",
    inputs: [
      { id: "inTrigger", name: "Check", type: "trigger" },
      { id: "condition", name: "Condition", type: "data", dataType: "any", value: "true" },
    ],
    outputs: [
      { id: "onTrue", name: "If", type: "trigger" },
      { id: "onFalse", name: "Else", type: "trigger" },
    ],
  },
  condValue: {
    type: "condValue",
    label: "Conditional Value",
    category: "Control Flow",
    description: "Returns True Value if condition is met, else False Value.",
    inputs: [
      { id: "condition", name: "Condition", type: "data", dataType: "boolean", value: true },
      { id: "trueVal", name: "True Val", type: "data", dataType: "any", value: 10 },
      { id: "falseVal", name: "False Val", type: "data", dataType: "any", value: 0 },
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "any" }],
  },
  delayNode: {
    type: "delayNode",
    label: "Execution Delay",
    category: "Control Flow",
    description: "Delays the trigger signal by a configured time (ms).",
    inputs: [
      { id: "inTrigger", name: "In", type: "trigger" },
      { id: "delayMs", name: "Delay (ms)", type: "data", dataType: "number", value: 1000 },
    ],
    outputs: [{ id: "outTrigger", name: "Out", type: "trigger" }],
    config: {},
  },
  forLoopNode: {
    type: "forLoopNode",
    label: "For Loop",
    category: "Control Flow",
    description: "Fires the Body trigger Count times (index output counts up), then fires Done.",
    inputs: [
      { id: "inTrigger", name: "Run", type: "trigger" },
      { id: "count", name: "Count", type: "data", dataType: "number", value: 3 },
    ],
    outputs: [
      { id: "loopBody", name: "Body", type: "trigger" },
      { id: "index", name: "Index", type: "data", dataType: "number" },
      { id: "done", name: "Done", type: "trigger" },
    ],
    config: { index: 0 },
  },
  whileLoopNode: {
    type: "whileLoopNode",
    label: "While Loop",
    category: "Control Flow",
    description: "Fires the Body trigger while Condition stays true (max 1000 iterations), then fires Done.",
    inputs: [
      { id: "inTrigger", name: "Run", type: "trigger" },
      { id: "condition", name: "Condition", type: "data", dataType: "any", value: "true" },
    ],
    outputs: [
      { id: "loopBody", name: "Body", type: "trigger" },
      { id: "iteration", name: "Iteration", type: "data", dataType: "number" },
      { id: "done", name: "Done", type: "trigger" },
    ],
    config: { iteration: 0 },
  },
  counterNode: {
    type: "counterNode",
    label: "Counter",
    category: "Control Flow",
    description: "Increments/decrements a count on trigger signal.",
    inputs: [
      { id: "incTrigger", name: "Inc", type: "trigger" },
      { id: "decTrigger", name: "Dec", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [{ id: "count", name: "Count", type: "data", dataType: "number" }],
    config: { count: 0 },
  },
  rangeNode: {
    type: "rangeNode",
    label: "Range",
    category: "Control Flow",
    description: "Checks whether Value falls within Min/Max on Check, tracking a counter that increases when in range and decreases when out of range.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "number", value: 0 },
      { id: "checkTrigger", name: "Check", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [
      { id: "inRange", name: "In Range", type: "data", dataType: "boolean" },
      { id: "above", name: "Above", type: "data", dataType: "boolean" },
      { id: "below", name: "Below", type: "data", dataType: "boolean" },
      { id: "count", name: "Count", type: "data", dataType: "number" },
    ],
    config: { min: 0, max: 10, initialCount: 0, count: 0 },
  },
  gateNode: {
    type: "gateNode",
    label: "Gate",
    category: "Control Flow",
    description: "Passes the trigger through only while its Open input is true — otherwise the chain stops here.",
    inputs: [
      { id: "inTrigger", name: "In", type: "trigger" },
      { id: "open", name: "Open", type: "data", dataType: "boolean", value: true },
    ],
    outputs: [{ id: "outTrigger", name: "Out", type: "trigger" }],
  },
  onceNode: {
    type: "onceNode",
    label: "Once",
    category: "Control Flow",
    description: "Passes the trigger through the first time only. Reset re-arms it.",
    inputs: [
      { id: "inTrigger", name: "In", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [{ id: "outTrigger", name: "Out", type: "trigger" }],
    config: { fired: false },
  },
  sequenceNode: {
    type: "sequenceNode",
    label: "Sequence",
    category: "Control Flow",
    description: "Fires Out 1, Out 2 then Out 3 in turn — one output per incoming trigger, cycling round.",
    inputs: [
      { id: "inTrigger", name: "In", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [
      { id: "out1", name: "Out 1", type: "trigger" },
      { id: "out2", name: "Out 2", type: "trigger" },
      { id: "out3", name: "Out 3", type: "trigger" },
    ],
    config: { step: 0 },
  },
};
