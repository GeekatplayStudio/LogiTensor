// Neural-network math shared by the Dense/Conv1D nodes, the 3D weight-web
// views, and the execution engine. Split out of execution-helpers.ts to keep
// that file under the repo's 500-line module guardrail.

// Deterministic 32-bit PRNG (mulberry32). The Dense Layer derives its weight
// matrix from this so weights stay stable across re-renders/reloads AND match
// the Python engine exactly — _mulberry32 in backend/engine/nn_math.py is a
// bit-for-bit port; change one and you must change both.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (((t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Weight matrix for a Dense Layer: weights[neuron][input] in [-1, 1),
 * generated row-by-row from the seeded PRNG (same order as the Python mirror).
 */
export function generateWeights(seed: number, inputSize: number, neurons: number): number[][] {
  const rand = mulberry32(seed);
  const weights: number[][] = [];
  for (let j = 0; j < neurons; j++) {
    const row: number[] = [];
    for (let i = 0; i < inputSize; i++) {
      row.push(rand() * 2 - 1);
    }
    weights.push(row);
  }
  return weights;
}

// Coerces a port value into a numeric vector (AI Model nodes pass arrays).
export function toNumberVector(v: any): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const n = Number(x);
    return isNaN(n) ? 0 : n;
  });
}

export const CONV_ACTIVATIONS: Record<string, (z: number) => number> = {
  relu: (z) => Math.max(0, z),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
  tanh: (z) => Math.tanh(z),
};

export function conv1dOutputPositions(inputLen: number, kernelSize: number, stride: number): number {
  if (inputLen < kernelSize || kernelSize < 1 || stride < 1) return 0;
  return Math.floor((inputLen - kernelSize) / stride) + 1;
}

/**
 * Runs a real 1D convolution: `filters` small kernels (generated from `seed`,
 * same mulberry32 PRNG as Dense Layer) each slide across `input` with the
 * given stride, producing one activated value per window. Filters' outputs
 * are concatenated into a single feature-map vector — unlike a Dense Layer,
 * each output only ever depends on a local neighborhood of the input.
 */
export function conv1dForward(
  input: number[],
  seed: number,
  kernelSize: number,
  filters: number,
  stride: number,
  activation: string
): number[] {
  const positions = conv1dOutputPositions(input.length, kernelSize, stride);
  if (positions === 0) return [];
  const kernels = generateWeights(seed, kernelSize, filters); // kernels[f][k]
  const fn = CONV_ACTIVATIONS[activation] ?? CONV_ACTIVATIONS.relu;
  const out: number[] = [];
  for (let f = 0; f < filters; f++) {
    for (let p = 0; p < positions; p++) {
      let z = 0;
      for (let k = 0; k < kernelSize; k++) z += kernels[f][k] * input[p * stride + k];
      out.push(fn(Math.max(-60, Math.min(60, z))));
    }
  }
  return out;
}

/**
 * Full [output][input] weight matrix for a Conv1D Layer, mostly zero except
 * each output's local receptive field — lets the 3D viewer and inline weight
 * web reuse the exact same dense-matrix rendering path as a Dense Layer while
 * still only lighting up the real local connections.
 */
export function conv1dFullWeights(
  inputLen: number,
  seed: number,
  kernelSize: number,
  filters: number,
  stride: number
): number[][] {
  const positions = conv1dOutputPositions(inputLen, kernelSize, stride);
  if (positions === 0) return [];
  const kernels = generateWeights(seed, kernelSize, filters);
  const weights: number[][] = [];
  for (let f = 0; f < filters; f++) {
    for (let p = 0; p < positions; p++) {
      const row = new Array(inputLen).fill(0);
      for (let k = 0; k < kernelSize; k++) row[p * stride + k] = kernels[f][k];
      weights.push(row);
    }
  }
  return weights;
}
