import type { NodeDefinition } from "./base";
import { ENABLED_INPUT } from "./base";

// AI Model — visual mini neural network: image → dense layers → readout.
export const AI_MODEL_NODES: Record<string, NodeDefinition> = {
  imageInputGrid: {
    type: "imageInputGrid",
    label: "Image Input Grid",
    category: "AI Model",
    description: "Upload an image and pixelate it onto an N×N grid — each cell becomes the average color and luminosity (0–1) of that region, forming the input layer of the network.",
    inputs: [],
    outputs: [{ id: "values", name: "Values", type: "data", dataType: "any" }],
    // imageSrc holds a small downscaled copy so re-gridding works after reload;
    // cellValues (luminosity vector) is what flows to downstream layers.
    config: { gridSize: 8, cellValues: [], cellColors: [], imageSrc: "", imageName: "" },
  },
  denseLayer: {
    type: "denseLayer",
    label: "Dense Layer",
    category: "AI Model",
    description: "Fully-connected neuron layer: every incoming value feeds every neuron through its own weight — the classic AI weight web, drawn live inside the node. Outputs the activated neuron values.",
    inputs: [
      { id: "in", name: "Values In", type: "data", dataType: "any", value: [] },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Activations", type: "data", dataType: "any" }],
    config: { neurons: 8, activation: "sigmoid", seed: 42 }, // sigmoid | relu | tanh
  },
  conv1dLayer: {
    type: "conv1dLayer",
    label: "Conv1D Layer",
    category: "AI Model",
    description: "Sliding-window convolution: each Filter's small kernel slides across the input, so every output only connects to a local neighborhood — not the whole previous layer, unlike a Dense Layer's full mesh. Multiple filters stack into one output vector.",
    inputs: [
      { id: "in", name: "Values In", type: "data", dataType: "any", value: [] },
      ENABLED_INPUT,
    ],
    outputs: [{ id: "out", name: "Feature Map", type: "data", dataType: "any" }],
    config: { filters: 4, kernelSize: 3, stride: 1, activation: "relu", seed: 42 }, // relu | sigmoid | tanh
  },
  outputLayerNode: {
    type: "outputLayerNode",
    label: "Output Layer",
    category: "AI Model",
    description: "Final readout of the network: shows each incoming activation as a bar and outputs the index of the strongest neuron (the winner).",
    inputs: [{ id: "in", name: "Activations", type: "data", dataType: "any", value: [] }],
    outputs: [
      { id: "out", name: "Values", type: "data", dataType: "any" },
      { id: "winner", name: "Winner", type: "data", dataType: "number" },
    ],
  },
};
