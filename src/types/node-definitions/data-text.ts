import type { NodeDefinition } from "./base";
import { ENABLED_INPUT } from "./base";

export const DATA_TEXT_NODES: Record<string, NodeDefinition> = {
  filterNode: {
    type: "filterNode",
    label: "Filter",
    category: "Data & Text",
    description: "Passes the value through only when it includes (or excludes) the search text.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: "" },
      { id: "search", name: "Search", type: "data", dataType: "string", value: "" },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "out", name: "Out", type: "data", dataType: "any" },
      { id: "match", name: "Match", type: "data", dataType: "boolean" },
    ],
    config: { mode: "include", caseSensitive: false }, // include | exclude
  },
  stringOpNode: {
    type: "stringOpNode",
    label: "Text Transform",
    category: "Data & Text",
    description: "Transforms text: uppercase, lowercase, trim, length, or reverse.",
    inputs: [
      { id: "text", name: "Text", type: "data", dataType: "string", value: "" },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "any" }],
    config: { op: "uppercase" }, // uppercase | lowercase | trim | length | reverse
  },
  replaceTextNode: {
    type: "replaceTextNode",
    label: "Text Replace",
    category: "Data & Text",
    description: "Replaces every occurrence of Find with Replace in the input text.",
    inputs: [
      { id: "text", name: "Text", type: "data", dataType: "string", value: "" },
      { id: "find", name: "Find", type: "data", dataType: "string", value: "" },
      { id: "replace", name: "Replace", type: "data", dataType: "string", value: "" },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
  },
};
