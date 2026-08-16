import type { NodeDefinition } from "./base";

export const AI_SCRIPT_NODES: Record<string, NodeDefinition> = {
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
