import type { NodeDefinition } from "./base";
import { ENABLED_INPUT } from "./base";

export const MATH_COMPARE_NODES: Record<string, NodeDefinition> = {
  randomNode: {
    type: "randomNode",
    label: "Random Number",
    category: "Math & Compare",
    description: "Generates a random integer value within a given min/max range on trigger.",
    inputs: [
      { id: "inTrigger", name: "Generate", type: "trigger" },
      { id: "min", name: "Min", type: "data", dataType: "number", value: 0 },
      { id: "max", name: "Max", type: "data", dataType: "number", value: 100 },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "value", name: "Value", type: "data", dataType: "number" },
    ],
  },
  mathNode: {
    type: "mathNode",
    label: "Formula",
    category: "Math & Compare",
    description: "Free-form formula over auto-growing lettered inputs (a, b, c…). Numbers compute, strings concatenate.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "any", value: 1 },
      { id: "b", name: "B", type: "data", dataType: "any", value: 1 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "any" }],
    config: { expression: "a + b", dynamicInputs: true },
  },
  mathFunctionNode: {
    type: "mathFunctionNode",
    label: "Math Function",
    category: "Math & Compare",
    description: "Applies a math function (abs, round, sqrt, pow, min, max, mod…) to its inputs.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "number", value: 0 },
      { id: "b", name: "B", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "number" }],
    config: { op: "abs" }, // abs | round | floor | ceil | sqrt | pow | min | max | mod
  },
  compareNode: {
    type: "compareNode",
    label: "Compare Values",
    category: "Math & Compare",
    description: "Compares A and B using the configured operator.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "number", value: 0 },
      { id: "b", name: "B", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "boolean" }],
    config: { op: ">" }, // options: ==, !=, >, >=, <, <=
  },
  expressionNode: {
    type: "expressionNode",
    label: "Safe Expression",
    category: "Math & Compare",
    description: "Evaluates a safe mathematical/logical expression.",
    inputs: [
      { id: "x", name: "X", type: "data", dataType: "number", value: 1 },
      { id: "y", name: "Y", type: "data", dataType: "number", value: 1 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "any" }],
    config: { expression: "x * 2 + y" },
  },
  clampNode: {
    type: "clampNode",
    label: "Clamp",
    category: "Math & Compare",
    description: "Constrains a value so it never leaves the Min..Max window.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "number", value: 0 },
      { id: "min", name: "Min", type: "data", dataType: "number", value: 0 },
      { id: "max", name: "Max", type: "data", dataType: "number", value: 1 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "number" }],
  },
  mapRangeNode: {
    type: "mapRangeNode",
    label: "Map Range",
    category: "Math & Compare",
    description: "Rescales a value from one numeric range onto another (e.g. 0..1023 to 0..100).",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "number", value: 0 },
      { id: "inMin", name: "In Min", type: "data", dataType: "number", value: 0 },
      { id: "inMax", name: "In Max", type: "data", dataType: "number", value: 1 },
      { id: "outMin", name: "Out Min", type: "data", dataType: "number", value: 0 },
      { id: "outMax", name: "Out Max", type: "data", dataType: "number", value: 100 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "number" }],
  },
  lerpNode: {
    type: "lerpNode",
    label: "Lerp",
    category: "Math & Compare",
    description: "Linearly interpolates between A and B by factor T (0 = A, 1 = B).",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "number", value: 0 },
      { id: "b", name: "B", type: "data", dataType: "number", value: 1 },
      { id: "t", name: "T", type: "data", dataType: "number", value: 0.5 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "number" }],
  },
  betweenNode: {
    type: "betweenNode",
    label: "Between",
    category: "Math & Compare",
    description: "Pure boolean test: is Value inside Min..Max? (Stateless — unlike the Range node.)",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "number", value: 0 },
      { id: "min", name: "Min", type: "data", dataType: "number", value: 0 },
      { id: "max", name: "Max", type: "data", dataType: "number", value: 10 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "In Range", type: "data", dataType: "boolean" }],
    config: { inclusive: true },
  },
  roundToNode: {
    type: "roundToNode",
    label: "Round To",
    category: "Math & Compare",
    description: "Rounds a value to a configured number of decimal places.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "number" }],
    config: { decimals: 2 },
  },
};
