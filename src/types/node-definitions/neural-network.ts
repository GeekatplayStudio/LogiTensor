import type { NodeDefinition } from "./base";
import { ENABLED_INPUT } from "./base";

export const NEURAL_NETWORK_NODES: Record<string, NodeDefinition> = {
  thresholdNeuron: {
    type: "thresholdNeuron",
    label: "Threshold Neuron",
    category: "Neural Network",
    description: "Fires only when Value crosses the Threshold (above or below, set by the switch), passing Value through.",
    inputs: [
      { id: "threshold", name: "Threshold", type: "data", dataType: "number", value: 5 },
      { id: "value", name: "Value", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "fired", name: "Fired", type: "data", dataType: "boolean" },
      { id: "out", name: "Out", type: "data", dataType: "any" },
    ],
    config: { mode: "above" }, // above | below
  },
  maxSelectorNode: {
    type: "maxSelectorNode",
    label: "Max Selector",
    category: "Neural Network",
    description: "Winner-take-all: outputs the highest value among its auto-growing inputs (a, b, c…), like lateral inhibition picking the strongest signal.",
    inputs: [
      { id: "a", name: "A", type: "data", dataType: "number", value: 0 },
      { id: "b", name: "B", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Max", type: "data", dataType: "number" }],
    config: { dynamicInputs: true },
  },
  synapseNode: {
    type: "synapseNode",
    label: "Synapse",
    category: "Neural Network",
    description: "Scales a signal by a synaptic Weight; flip Inhibitory to make the connection subtract instead of add.",
    inputs: [
      { id: "in", name: "Signal", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Out", type: "data", dataType: "number" }],
    config: { weight: 1, inhibitory: false },
  },
  leakyIntegrateFire: {
    type: "leakyIntegrateFire",
    label: "LIF Neuron",
    category: "Neural Network",
    description: "Leaky integrate-and-fire neuron: each Step adds Input to its membrane potential, which decays by Leak, then fires Spike and resets once Threshold is crossed. Enabled=false freezes the neuron (no integration, no spike).",
    inputs: [
      { id: "inTrigger", name: "Step", type: "trigger" },
      { id: "input", name: "Input", type: "data", dataType: "number", value: 0 },
      ENABLED_INPUT,
    ],
    outputs: [
      { id: "spike", name: "Spike", type: "trigger" },
      { id: "potential", name: "Potential", type: "data", dataType: "number" },
    ],
    config: { potential: 0, threshold: 1, leak: 0.2, resetValue: 0 },
  },
};
