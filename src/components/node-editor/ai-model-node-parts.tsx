// Visual bodies for the AI Model node group (Image Input Grid, Dense Layer,
// Conv1D Layer, Output Layer). Implementations live in ai-model-parts/ to keep
// each file under the repo's module size guardrail; this barrel preserves the
// original import path for consumers like custom-nodes.tsx.

export { ImageGridBody } from "./ai-model-parts/image-grid-body";
export { DenseLayerBody } from "./ai-model-parts/dense-layer-body";
export { Conv1DLayerBody } from "./ai-model-parts/conv1d-layer-body";
export { OutputLayerBody } from "./ai-model-parts/output-layer-body";
