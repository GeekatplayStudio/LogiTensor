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
  category: "Inputs" | "Logic" | "Control Flow" | "Math & Compare" | "Data & Text" | "Outputs" | "AI & Scripts";
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  config?: Record<string, any>;
}

export const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
  // Inputs
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

  // Logic
  andGate: {
    type: "andGate",
    label: "AND Gate",
    category: "Logic",
    description: "Logical AND operation. True only if both inputs are true.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "boolean", value: true },
      { id: "b", name: "B", type: "data", dataType: "boolean", value: true },
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
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },
  notGate: {
    type: "notGate",
    label: "NOT Gate",
    category: "Logic",
    description: "Logical NOT operation. Inverts the input boolean value.",
    inputs: [{ id: "a", name: "A", type: "data", dataType: "boolean", value: false }],
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
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "boolean" }],
  },

  // Control Flow
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

  // Math & Compare
  mathNode: {
    type: "mathNode",
    label: "Formula",
    category: "Math & Compare",
    description: "Free-form formula over auto-growing lettered inputs (a, b, c…). Numbers compute, strings concatenate.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "any", value: 1 },
      { id: "b", name: "B", type: "data", dataType: "any", value: 1 },
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
    ],
    outputs: [{ id: "out", name: "Result", type: "data", dataType: "any" }],
    config: { expression: "x * 2 + y" },
  },

  // Data & Text
  filterNode: {
    type: "filterNode",
    label: "Filter",
    category: "Data & Text",
    description: "Passes the value through only when it includes (or excludes) the search text.",
    inputs: [
      { id: "value", name: "Value", type: "data", dataType: "any", value: "" },
      { id: "search", name: "Search", type: "data", dataType: "string", value: "" },
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
    inputs: [{ id: "text", name: "Text", type: "data", dataType: "string", value: "" }],
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
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "string" }],
  },

  // Outputs
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

  // AI & Scripts
  pythonScript: {
    type: "pythonScript",
    label: "Python Script",
    category: "AI & Scripts",
    description: "Executes a sandboxed Python script with x and y inputs.",
    inputs: [
      { id: "inTrigger", name: "Run", type: "trigger" },
      { id: "x", name: "X", type: "data", dataType: "any", value: 10 },
      { id: "y", name: "Y", type: "data", dataType: "any", value: 5 },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "result", name: "Result", type: "data", dataType: "any" },
    ],
    config: {
      code: "# Variables x and y are available\n# Assign output to the 'result' variable\n\nresult = x + y\nprint(f'Executed: {x} + {y} = {result}')\n",
    },
  },
  ollamaLLM: {
    type: "ollamaLLM",
    label: "Ollama LLM",
    category: "AI & Scripts",
    description: "Queries a local Ollama Large Language Model.",
    inputs: [
      { id: "inTrigger", name: "Generate", type: "trigger" },
      { id: "prompt", name: "Prompt", type: "data", dataType: "string", value: "Why is the sky blue?" },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "response", name: "Response", type: "data", dataType: "string" },
    ],
    config: {
      model: "llama3",
      systemPrompt: "You are a helpful and concise assistant.",
    },
  },
  ollamaVLM: {
    type: "ollamaVLM",
    label: "Ollama VLM",
    category: "AI & Scripts",
    description: "Queries a local Ollama Vision Language Model with an image.",
    inputs: [
      { id: "inTrigger", name: "Analyze", type: "trigger" },
      { id: "prompt", name: "Prompt", type: "data", dataType: "string", value: "What is in this image?" },
      { id: "image", name: "Image (Base64)", type: "data", dataType: "string", value: "" },
    ],
    outputs: [
      { id: "outTrigger", name: "Out", type: "trigger" },
      { id: "response", name: "Response", type: "data", dataType: "string" },
    ],
    config: {
      model: "llava",
    },
  },
};
