import { safeEvaluate } from "./safe-evaluator";

// Numeric-looking strings become numbers so the Formula node does math on
// them; everything else stays as-is so `+` concatenates and comparisons work
// lexically — this is the number-vs-string awareness of the Formula node.
function coerceOperand(v: any): any {
  if (typeof v === "string") {
    const t = v.trim();
    if (t !== "" && !isNaN(Number(t))) return Number(t);
  }
  return v;
}

// Deterministic 32-bit PRNG (mulberry32). The Dense Layer derives its weight
// matrix from this so weights stay stable across re-renders/reloads AND match
// the Python engine exactly — _mulberry32 in backend/execution_engine.py is a
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

const CONV_ACTIVATIONS: Record<string, (z: number) => number> = {
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

/**
 * Resolves any condition-ish value (booleans, "true"/"1"/"yes" strings, or a
 * safe expression string) to a boolean. Shared by If/Else and While Loop.
 */
export function resolveConditionFlag(condVal: any): boolean {
  if (typeof condVal !== "string") return Boolean(condVal);
  const trimmed = condVal.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1" || trimmed === "yes") return true;
  if (trimmed === "false" || trimmed === "0" || trimmed === "no" || trimmed === "") return false;
  try {
    return Boolean(safeEvaluate(trimmed, {}));
  } catch {
    return false;
  }
}

// Nodes that carry the Enabled bypass input (see ENABLED_INPUT in
// src/types/nodes.ts): when Enabled resolves to false, the node skips its own
// computation and passes its primary input straight through to its primary
// output, exactly as if it weren't in the graph. Kept as an explicit map
// (rather than "first input, first output") since the primary port isn't
// always index 0 (e.g. Filter's primary is `value`, not `search`).
const BYPASS_PORTS: Record<string, { primaryIn: string; primaryOut: string }> = {
  andGate: { primaryIn: "a", primaryOut: "out" },
  orGate: { primaryIn: "a", primaryOut: "out" },
  notGate: { primaryIn: "a", primaryOut: "out" },
  xorGate: { primaryIn: "a", primaryOut: "out" },
  norGate: { primaryIn: "a", primaryOut: "out" },
  nandGate: { primaryIn: "a", primaryOut: "out" },
  compareNode: { primaryIn: "a", primaryOut: "out" },
  expressionNode: { primaryIn: "x", primaryOut: "out" },
  mathNode: { primaryIn: "a", primaryOut: "out" },
  mathFunctionNode: { primaryIn: "a", primaryOut: "out" },
  filterNode: { primaryIn: "value", primaryOut: "out" },
  stringOpNode: { primaryIn: "text", primaryOut: "out" },
  replaceTextNode: { primaryIn: "text", primaryOut: "out" },
  thresholdNeuron: { primaryIn: "value", primaryOut: "out" },
  maxSelectorNode: { primaryIn: "a", primaryOut: "out" },
  synapseNode: { primaryIn: "in", primaryOut: "out" },
  denseLayer: { primaryIn: "in", primaryOut: "out" },
  conv1dLayer: { primaryIn: "in", primaryOut: "out" },
};

/**
 * Computes data output port values based on the node's type, inputs, and config parameters.
 */
export function computeNodeOutputs(
  type: string,
  inputs: Record<string, any>,
  config: Record<string, any> = {}
): Record<string, any> {
  const bypass = BYPASS_PORTS[type];
  if (bypass && inputs.enabled === false) {
    return { [bypass.primaryOut]: inputs[bypass.primaryIn] };
  }

  const outputs: Record<string, any> = {};

  switch (type) {
    case "constNum":
      outputs.value = Number(config.value ?? 0);
      break;
    case "constBool":
      outputs.value = Boolean(config.value ?? true);
      break;
    case "constString":
      outputs.value = String(config.value ?? "");
      break;
    case "andGate":
      outputs.out = Boolean(inputs.a && inputs.b);
      break;
    case "orGate":
      outputs.out = Boolean(inputs.a || inputs.b);
      break;
    case "notGate":
      outputs.out = !inputs.a;
      break;
    case "xorGate":
      outputs.out = inputs.a !== inputs.b;
      break;
    case "norGate":
      outputs.out = !(inputs.a || inputs.b);
      break;
    case "nandGate":
      outputs.out = !(inputs.a && inputs.b);
      break;
    case "condValue":
      outputs.out = inputs.condition ? inputs.trueVal : inputs.falseVal;
      break;
    case "compareNode": {
      const op = config.op ?? "==";
      const a = inputs.a;
      const b = inputs.b;
      let res = false;
      switch (op) {
        case "==":
          res = a == b;
          break;
        case "!=":
          res = a != b;
          break;
        case ">":
          res = Number(a) > Number(b);
          break;
        case ">=":
          res = Number(a) >= Number(b);
          break;
        case "<":
          res = Number(a) < Number(b);
          break;
        case "<=":
          res = Number(a) <= Number(b);
          break;
      }
      outputs.out = res;
      break;
    }
    case "expressionNode": {
      const expr = config.expression ?? "x * 2 + y";
      // Ports display as X/Y on the node but are named x/y — accept either case.
      const exprCtx: Record<string, any> = {};
      for (const key of Object.keys(inputs)) {
        exprCtx[key] = inputs[key];
        exprCtx[key.toUpperCase()] = inputs[key];
      }
      outputs.out = safeEvaluate(expr, exprCtx);
      break;
    }
    case "mathNode": {
      const expr = config.expression ?? "a + b";
      const ctx: Record<string, any> = {};
      // Ports are named a/b/c… but display as A/B/C on the node — accept
      // either case in the formula so typing what you see on the node works.
      for (const key of Object.keys(inputs)) {
        const val = coerceOperand(inputs[key]);
        ctx[key] = val;
        ctx[key.toUpperCase()] = val;
      }
      outputs.out = safeEvaluate(expr, ctx);
      break;
    }
    case "mathFunctionNode": {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 0);
      const op = config.op ?? "abs";
      const fns: Record<string, () => number> = {
        abs: () => Math.abs(a),
        round: () => Math.round(a),
        floor: () => Math.floor(a),
        ceil: () => Math.ceil(a),
        sqrt: () => Math.sqrt(a),
        pow: () => Math.pow(a, b),
        min: () => Math.min(a, b),
        max: () => Math.max(a, b),
        mod: () => (b === 0 ? 0 : ((a % b) + b) % b),
      };
      outputs.out = (fns[op] ?? fns.abs)();
      break;
    }
    case "filterNode": {
      const val = inputs.value;
      const search = String(inputs.search ?? "");
      const hay = typeof val === "object" && val !== null ? JSON.stringify(val) : String(val ?? "");
      const found = config.caseSensitive
        ? hay.includes(search)
        : hay.toLowerCase().includes(search.toLowerCase());
      const pass = (config.mode ?? "include") === "include" ? found : !found;
      outputs.match = pass;
      outputs.out = pass ? val : null;
      break;
    }
    case "stringOpNode": {
      const text = String(inputs.text ?? "");
      const op = config.op ?? "uppercase";
      if (op === "uppercase") outputs.out = text.toUpperCase();
      else if (op === "lowercase") outputs.out = text.toLowerCase();
      else if (op === "trim") outputs.out = text.trim();
      else if (op === "length") outputs.out = text.length;
      else if (op === "reverse") outputs.out = [...text].reverse().join("");
      else outputs.out = text;
      break;
    }
    case "replaceTextNode": {
      const text = String(inputs.text ?? "");
      const find = String(inputs.find ?? "");
      outputs.out = find === "" ? text : text.split(find).join(String(inputs.replace ?? ""));
      break;
    }
    case "forLoopNode":
      outputs.index = Number(config.index ?? 0);
      break;
    case "whileLoopNode":
      outputs.iteration = Number(config.iteration ?? 0);
      break;
    case "counterNode":
      outputs.count = Number(config.count ?? 0);
      break;
    case "randomNode": {
      const minVal = Number(inputs.min ?? 0);
      const maxVal = Number(inputs.max ?? 100);
      const min = Math.min(minVal, maxVal);
      const max = Math.max(minVal, maxVal);
      outputs.value = Math.floor(Math.random() * (max - min + 1)) + min;
      break;
    }
    case "textOutputNode":
      outputs.value = inputs.value;
      break;
    case "thresholdNeuron": {
      const value = Number(inputs.value ?? 0);
      const threshold = Number(inputs.threshold ?? 0);
      const fired = (config.mode ?? "above") === "below" ? value < threshold : value > threshold;
      outputs.fired = fired;
      outputs.out = fired ? value : null;
      break;
    }
    case "maxSelectorNode": {
      const vals = Object.values(inputs)
        .map((v) => Number(v))
        .filter((v) => !isNaN(v));
      outputs.out = vals.length ? Math.max(...vals) : 0;
      break;
    }
    case "synapseNode": {
      const weight = Number(config.weight ?? 1);
      const signal = Number(inputs.in ?? 0) * weight;
      outputs.out = config.inhibitory ? -Math.abs(signal) : signal;
      break;
    }
    case "leakyIntegrateFire":
      outputs.potential = Number(config.potential ?? 0);
      break;
    case "imageInputGrid":
      outputs.values = Array.isArray(config.cellValues) ? config.cellValues : [];
      break;
    case "denseLayer": {
      const xs = toNumberVector(inputs.in);
      const neurons = Math.max(1, Math.min(64, Math.floor(Number(config.neurons ?? 8) || 1)));
      const seed = Math.floor(Number(config.seed ?? 42) || 0);
      const activation = config.activation ?? "sigmoid";
      const weights = generateWeights(seed, xs.length, neurons);
      // Normalize by sqrt(inputs) so activations stay in a useful range no
      // matter the grid size feeding the layer.
      const norm = Math.max(1, Math.sqrt(xs.length));
      outputs.out = weights.map((row) => {
        let z = 0;
        for (let i = 0; i < xs.length; i++) z += row[i] * xs[i];
        z = Math.max(-60, Math.min(60, z / norm));
        if (activation === "relu") return Math.max(0, z);
        if (activation === "tanh") return Math.tanh(z);
        return 1 / (1 + Math.exp(-z)); // sigmoid
      });
      break;
    }
    case "conv1dLayer": {
      const xs = toNumberVector(inputs.in);
      const filters = Math.max(1, Math.min(32, Math.floor(Number(config.filters ?? 4) || 1)));
      const kernelSize = Math.max(1, Math.min(16, Math.floor(Number(config.kernelSize ?? 3) || 1)));
      const stride = Math.max(1, Math.floor(Number(config.stride ?? 1) || 1));
      const seed = Math.floor(Number(config.seed ?? 42) || 0);
      const activation = config.activation ?? "relu";
      outputs.out = conv1dForward(xs, seed, kernelSize, filters, stride, activation);
      break;
    }
    case "outputLayerNode": {
      const xs = toNumberVector(inputs.in);
      outputs.out = xs;
      let winner = -1;
      for (let i = 0; i < xs.length; i++) {
        if (winner === -1 || xs[i] > xs[winner]) winner = i;
      }
      outputs.winner = winner;
      break;
    }
    default:
      break;
  }

  return outputs;
}

/**
 * Handles operations executed during active trigger signals (like delay timers, log updates, counters).
 * Returns the next port in the execution chain and any config modifications.
 */
export async function handleTriggerOperation(
  type: string,
  inputs: Record<string, any>,
  config: Record<string, any> = {},
  targetPortId: string
): Promise<{
  nextTriggerPort: string | null;
  updatedConfig?: Record<string, any>;
}> {
  let nextTriggerPort: string | null = null;
  let updatedConfig: Record<string, any> | undefined = undefined;

  if (type === "loggerNode") {
    const valToLog = inputs.value;
    const logStr = `[${new Date().toLocaleTimeString()}] ${
      typeof valToLog === "object" ? JSON.stringify(valToLog) : valToLog
    }`;
    const logs = [...(config.logs ?? []), logStr];
    updatedConfig = { ...config, logs };
    nextTriggerPort = "outTrigger";
  } 
  else if (type === "delayNode") {
    const delayMs = Number(inputs.delayMs ?? 1000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    nextTriggerPort = "outTrigger";
  }
  else if (type === "randomNode") {
    nextTriggerPort = "outTrigger";
  }
  else if (type === "textOutputNode") {
    nextTriggerPort = "outTrigger";
  } 
  else if (type === "ifElseTrigger") {
    nextTriggerPort = resolveConditionFlag(inputs.condition) ? "onTrue" : "onFalse";
  }
  else if (type === "leakyIntegrateFire" && inputs.enabled === false) {
    // Bypassed: the neuron is frozen — no leak, no integration, no spike.
    nextTriggerPort = null;
  }
  else if (type === "leakyIntegrateFire") {
    const leak = Number(config.leak ?? 0.2);
    const threshold = Number(config.threshold ?? 1);
    const resetValue = Number(config.resetValue ?? 0);
    const input = Number(inputs.input ?? 0);
    const decayed = Number(config.potential ?? 0) * (1 - Math.min(Math.max(leak, 0), 1));
    const potential = decayed + input;
    const fired = potential >= threshold;
    updatedConfig = { ...config, potential: fired ? resetValue : potential };
    nextTriggerPort = fired ? "spike" : null;
  }
  else if (type === "counterNode") {
    let change = 0;
    if (targetPortId === "incTrigger") change = 1;
    else if (targetPortId === "decTrigger") change = -1;

    const currentCount =
      targetPortId === "resetTrigger"
        ? 0
        : Number(config.count ?? 0) + change;

    updatedConfig = { ...config, count: currentCount };
  }

  return { nextTriggerPort, updatedConfig };
}
