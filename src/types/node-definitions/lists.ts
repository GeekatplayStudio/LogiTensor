import type { NodeDefinition } from "./base";
import { ENABLED_INPUT } from "./base";

export const LIST_NODES: Record<string, NodeDefinition> = {
  listAppendNode: {
    type: "listAppendNode",
    label: "List Append",
    category: "Lists",
    description: "Collects values into a list — each Append trigger pushes the current Value onto the end.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: 0 },
      { id: "inTrigger", name: "Append", type: "trigger" },
      { id: "resetTrigger", name: "Reset", type: "trigger" },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "list", name: "List", type: "data", dataType: "any" },
      { id: "length", name: "Length", type: "data", dataType: "number" },
    ],
    config: { items: [] as any[] },
  },
  listLengthNode: {
    type: "listLengthNode",
    label: "List Length",
    category: "Lists",
    description: "Reports how many entries a list holds.",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "length", name: "Length", type: "data", dataType: "number" }],
  },
  listGetNode: {
    type: "listGetNode",
    label: "List Get",
    category: "Lists",
    description: "Reads one entry by index. Negative indexes count back from the end (-1 = last).",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      { id: "index", name: "Index", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "item", name: "Item", type: "data", dataType: "any" },
      { id: "found", name: "Found", type: "data", dataType: "boolean" },
    ],
  },
  listStatsNode: {
    type: "listStatsNode",
    label: "List Stats",
    category: "Lists",
    description: "Aggregates a list of numbers: sum, average, min, max, or count.",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "number" }],
    config: { op: "sum" }, // sum | avg | min | max | count
  },
  listSortNode: {
    type: "listSortNode",
    label: "List Sort",
    category: "Lists",
    description: "Sorts a list ascending or descending, comparing entries numerically or as text.",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Sorted", type: "data", dataType: "any" }],
    config: { direction: "asc", numeric: true }, // asc | desc
  },
  listSliceNode: {
    type: "listSliceNode",
    label: "List Slice",
    category: "Lists",
    description: "Takes the sub-list between Start and End (negative indexes count from the end).",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      { id: "start", name: "Start", type: "data", dataType: "number", value: 0 },
      { id: "end", name: "End", type: "data", dataType: "number", value: 2 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Slice", type: "data", dataType: "any" }],
  },
  listContainsNode: {
    type: "listContainsNode",
    label: "List Contains",
    category: "Lists",
    description: "Checks whether a list holds the given value, reporting the index where it was found.",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      { id: "value", name: "Value", type: "data", dataType: "any", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "out", name: "Contains", type: "data", dataType: "boolean" },
      { id: "index", name: "Index", type: "data", dataType: "number" },
    ],
  },
};
