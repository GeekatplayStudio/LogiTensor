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
  splitTextNode: {
    type: "splitTextNode",
    label: "Split Text",
    category: "Data & Text",
    description:
      "Splits text into a list — on a delimiter, on runs of whitespace (words), or into lines — also reporting how many parts were produced.",
    inputs: [
      { id: "text", name: "Text", type: "data", dataType: "string", value: "" },
      { id: "delimiter", name: "Delimiter", type: "data", dataType: "string", value: "," },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "list", name: "List", type: "data", dataType: "any" },
      { id: "count", name: "Count", type: "data", dataType: "number" },
    ],
    config: { mode: "delimiter" }, // delimiter | whitespace | lines
  },
  joinTextNode: {
    type: "joinTextNode",
    label: "Join Text",
    category: "Data & Text",
    description: "Joins a list into a single string separated by the delimiter.",
    inputs: [
      { id: "list", name: "List", type: "data", dataType: "any", value: [] },
      { id: "delimiter", name: "Delimiter", type: "data", dataType: "string", value: ", " },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
  },
  substringNode: {
    type: "substringNode",
    label: "Substring",
    category: "Data & Text",
    description: "Extracts Length characters from Text starting at Start (negative Start counts from the end).",
    inputs: [
      { id: "text", name: "Text", type: "data", dataType: "string", value: "" },
      { id: "start", name: "Start", type: "data", dataType: "number", value: 0 },
      { id: "length", name: "Length", type: "data", dataType: "number", value: 5 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
  },
  templateNode: {
    type: "templateNode",
    label: "Text Template",
    category: "Data & Text",
    description: "Fills {a}/{b}/{c}… placeholders in a template from auto-growing lettered inputs.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "any", value: "" },
      { id: "b", name: "B", type: "data", dataType: "any", value: "" },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
    config: { template: "{a} {b}", dynamicInputs: true },
  },
  jsonParseNode: {
    type: "jsonParseNode",
    label: "JSON Parse",
    category: "Data & Text",
    description: "Parses a JSON string into data. Valid reports whether the text parsed cleanly.",
    inputs: [
      { id: "text", name: "Text", type: "data", dataType: "string", value: "{}" },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "out", name: "Data", type: "data", dataType: "any" },
      { id: "valid", name: "Valid", type: "data", dataType: "boolean" },
    ],
  },
  jsonStringifyNode: {
    type: "jsonStringifyNode",
    label: "JSON Stringify",
    category: "Data & Text",
    description: "Serializes any incoming value to a JSON string, optionally pretty-printed.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: null },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
    config: { pretty: false },
  },
  toNumberNode: {
    type: "toNumberNode",
    label: "To Number",
    category: "Data & Text",
    description: "Converts any value to a number (non-numeric values become 0).",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: "0" },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "number" }],
  },
  toStringNode: {
    type: "toStringNode",
    label: "To String",
    category: "Data & Text",
    description: "Converts any value to its text representation (objects and lists become JSON).",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
  },
  toBooleanNode: {
    type: "toBooleanNode",
    label: "To Boolean",
    category: "Data & Text",
    description: 'Converts any value to true/false — "false", "no", "0" and empty text all read as false.',
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: "true" },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  regexMatchNode: {
    type: "regexMatchNode",
    label: "Regex Match",
    category: "Data & Text",
    description: "Tests text against a regular expression, returning whether it matched and the first match.",
    inputs: [
      { id: "text", name: "Text", type: "data", dataType: "string", value: "" },
      { id: "pattern", name: "Pattern", type: "data", dataType: "string", value: "\\d+" },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "matched", name: "Matched", type: "data", dataType: "boolean" },
      { id: "match", name: "First Match", type: "data", dataType: "string" },
    ],
    config: { ignoreCase: false },
  },
};
