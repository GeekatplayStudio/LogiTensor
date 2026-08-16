import { toBool, toNum, toList, toStr } from "./node-value-utils";

type Compute = (inputs: Record<string, any>, config: Record<string, any>) => Record<string, any>;

/** Rounds half-away-from-zero-upward exactly like JS Math.round, so the
 * Python mirror (which uses banker's rounding by default) can match. */
function roundTo(value: number, decimals: number): number {
  const d = Math.max(0, Math.min(10, Math.trunc(decimals)));
  const factor = 10 ** d;
  return Math.floor(value * factor + 0.5) / factor;
}

/**
 * Pure computations for the Inputs / Logic / Math / Data & Text / Outputs
 * nodes added on top of the original library. Registered into
 * computeNodeOutputs via EXTRA_COMPUTE; mirrored by backend/engine/extra.py.
 */
export const EXTRA_COMPUTE: Record<string, Compute> = {
  sliderInput: (_inputs, config) => {
    const lo = toNum(config.min, 0);
    const hi = toNum(config.max, 100);
    return { value: Math.min(Math.max(toNum(config.value), Math.min(lo, hi)), Math.max(lo, hi)) };
  },

  textAreaInput: (_inputs, config) => ({ value: String(config.value ?? "") }),

  currentTimeNode: () => {
    const epoch = Date.now();
    return { epoch, formatted: new Date(epoch).toLocaleTimeString() };
  },

  xnorGate: (inputs) => ({ out: Boolean(inputs.a) === Boolean(inputs.b) }),

  // Stateful gates: state lives in config (owned by handleTriggerOperation),
  // the pure pass just republishes it for downstream data consumers.
  toggleNode: (_inputs, config) => ({ state: Boolean(config.state) }),
  latchNode: (_inputs, config) => ({ state: Boolean(config.state) }),

  clampNode: (inputs) => {
    const lo = Math.min(toNum(inputs.min), toNum(inputs.max));
    const hi = Math.max(toNum(inputs.min), toNum(inputs.max));
    return { out: Math.min(Math.max(toNum(inputs.value), lo), hi) };
  },

  mapRangeNode: (inputs) => {
    const inMin = toNum(inputs.inMin);
    const inMax = toNum(inputs.inMax);
    const outMin = toNum(inputs.outMin);
    // A zero-width source range has no meaningful ratio — collapse to outMin
    // rather than dividing by zero.
    if (inMax === inMin) return { out: outMin };
    const ratio = (toNum(inputs.value) - inMin) / (inMax - inMin);
    return { out: outMin + ratio * (toNum(inputs.outMax) - outMin) };
  },

  lerpNode: (inputs) => {
    const a = toNum(inputs.a);
    return { out: a + (toNum(inputs.b) - a) * toNum(inputs.t) };
  },

  betweenNode: (inputs, config) => {
    const value = toNum(inputs.value);
    const lo = Math.min(toNum(inputs.min), toNum(inputs.max));
    const hi = Math.max(toNum(inputs.min), toNum(inputs.max));
    const inclusive = config.inclusive ?? true;
    return { out: inclusive ? value >= lo && value <= hi : value > lo && value < hi };
  },

  roundToNode: (inputs, config) => ({ out: roundTo(toNum(inputs.value), toNum(config.decimals, 2)) }),

  splitTextNode: (inputs) => {
    const text = toStr(inputs.text);
    const delim = String(inputs.delimiter ?? "");
    const list = delim === "" ? [...text] : text.split(delim);
    return { list, count: list.length };
  },

  joinTextNode: (inputs) => ({
    out: toList(inputs.list).map(toStr).join(String(inputs.delimiter ?? "")),
  }),

  substringNode: (inputs) => {
    const text = toStr(inputs.text);
    const raw = Math.trunc(toNum(inputs.start));
    const start = raw < 0 ? Math.max(0, text.length + raw) : raw;
    const length = Math.max(0, Math.trunc(toNum(inputs.length)));
    return { out: text.slice(start, start + length) };
  },

  templateNode: (inputs, config) => {
    let out = String(config.template ?? "");
    // Lettered inputs only (a, b, c…) — the Enabled bypass port is not a
    // placeholder. Both {a} and {A} are accepted, matching the Formula node.
    for (const key of Object.keys(inputs)) {
      if (!/^[a-z]$/.test(key)) continue;
      const val = toStr(inputs[key]);
      out = out.split(`{${key}}`).join(val).split(`{${key.toUpperCase()}}`).join(val);
    }
    return { out };
  },

  jsonParseNode: (inputs) => {
    try {
      return { out: JSON.parse(toStr(inputs.text)), valid: true };
    } catch {
      return { out: null, valid: false };
    }
  },

  jsonStringifyNode: (inputs, config) => ({
    out: JSON.stringify(inputs.value ?? null, null, config.pretty ? 2 : 0),
  }),

  toNumberNode: (inputs) => ({ out: toNum(inputs.value) }),
  toStringNode: (inputs) => ({ out: toStr(inputs.value) }),
  toBooleanNode: (inputs) => ({ out: toBool(inputs.value) }),

  regexMatchNode: (inputs, config) => {
    try {
      const re = new RegExp(String(inputs.pattern ?? ""), config.ignoreCase ? "i" : "");
      const m = re.exec(toStr(inputs.text));
      return { matched: m !== null, match: m ? m[0] : "" };
    } catch {
      // An invalid pattern is a user typo mid-edit, not a graph failure.
      return { matched: false, match: "" };
    }
  },

  valueListNode: (_inputs, config) => {
    const values = toList(config.values);
    return { list: values, length: values.length };
  },

  gaugeNode: (inputs, config) => {
    const lo = toNum(config.min, 0);
    const hi = toNum(config.max, 100);
    if (hi === lo) return { percent: 0 };
    const pct = ((toNum(inputs.value) - lo) / (hi - lo)) * 100;
    return { percent: Math.min(100, Math.max(0, pct)) };
  },
};

/** Enabled-bypass primary ports for the pure nodes above. */
export const EXTRA_BYPASS_PORTS: Record<string, { primaryIn: string; primaryOut: string }> = {
  xnorGate: { primaryIn: "a", primaryOut: "out" },
  clampNode: { primaryIn: "value", primaryOut: "out" },
  mapRangeNode: { primaryIn: "value", primaryOut: "out" },
  lerpNode: { primaryIn: "a", primaryOut: "out" },
  betweenNode: { primaryIn: "value", primaryOut: "out" },
  roundToNode: { primaryIn: "value", primaryOut: "out" },
  splitTextNode: { primaryIn: "text", primaryOut: "list" },
  joinTextNode: { primaryIn: "list", primaryOut: "out" },
  substringNode: { primaryIn: "text", primaryOut: "out" },
  templateNode: { primaryIn: "a", primaryOut: "out" },
  jsonParseNode: { primaryIn: "text", primaryOut: "out" },
  jsonStringifyNode: { primaryIn: "value", primaryOut: "out" },
  toNumberNode: { primaryIn: "value", primaryOut: "out" },
  toStringNode: { primaryIn: "value", primaryOut: "out" },
  toBooleanNode: { primaryIn: "value", primaryOut: "out" },
  regexMatchNode: { primaryIn: "text", primaryOut: "match" },
};
