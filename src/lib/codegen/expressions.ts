import type { GraphNode, LanguageProfile } from "./types";
import { GraphView, NameAllocator } from "./graph";
import { literal } from "./profiles";
import { extraOutputExpr } from "./expressions-extra";
import { deviceOutputExpr } from "./expressions-device";
import type { MaterializeCtx } from "./materialize";
import { materializeOutput } from "./materialize";

// Emits the expression for one data output port, recursing through upstream
// wires (ash-mesh expression-threading). Stateful nodes don't recurse — their
// outputs read the state variable that the chain walker (chains.ts) mutates.
// Non-trivial data outputs are then bound to a named variable (materialize.ts)
// so every node owns at least one emitted, attributable line.

export interface EmitCtx extends MaterializeCtx {
  graph: GraphView;
  profile: LanguageProfile;
  names: NameAllocator;
  /** setup lines keyed by content for whole-block dedup (ash-mesh pattern) */
  setup: Map<string, string[]>;
  warnings: string[];
  /** guards against cycles in the data graph */
  visiting: Set<string>;
  /** node ids already emitted inside a trigger chain (see stepInto) */
  emitted: Set<string>;
  /** module-level state variable names — Python trigger functions must
   * declare them `global`, or assignment silently rebinds a local and the
   * read before it raises UnboundLocalError */
  stateVars: Set<string>;
}

export function addSetup(ctx: EmitCtx, lines: string[]): void {
  ctx.setup.set(lines.join("\n"), lines);
}

/** Resolve a node input: upstream expression if wired, else its static literal. */
export function inputExpr(ctx: EmitCtx, node: GraphNode, portId: string): string {
  const edge = ctx.graph.edgeInto(node.id, portId);
  if (edge?.source && edge.sourceHandle) {
    const src = ctx.graph.node(edge.source);
    if (src) return outputExpr(ctx, src, edge.sourceHandle);
  }
  return literal(ctx.profile, ctx.graph.staticValue(node.id, portId));
}

/** Substitute lettered identifiers (a/A, b/B, …) in a formula with input exprs. */
function substituteFormula(expr: string, vars: Record<string, string>): string {
  return expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (word) => vars[word.toLowerCase()] ?? word);
}

export function outputExpr(ctx: EmitCtx, node: GraphNode, portId: string): string {
  const key = `${node.id}:${portId}`;
  // Already named in this scope: reference it. This is what makes a shared
  // producer emit once — and it fixes a real bug, since inlining a Random
  // Number twice used to draw two different numbers.
  const named = ctx.materialized.get(key);
  if (named) return named;
  if (ctx.visiting.has(key)) {
    ctx.warnings.push(`Cycle detected through ${node.data.label} — emitted as null.`);
    return ctx.profile.nil;
  }
  ctx.visiting.add(key);
  let expr: string;
  try {
    expr = computeOutputExpr(ctx, node, portId);
  } finally {
    ctx.visiting.delete(key);
  }
  return materializeOutput(ctx, node, portId, expr);
}

// Mirrors computeNodeOutputs in src/lib/execution-helpers.ts node-for-node —
// that file is the semantic source of truth; when it changes, this must too.
function computeOutputExpr(ctx: EmitCtx, node: GraphNode, portId: string): string {
  const p = ctx.profile;
  const config = node.data.config ?? {};
  const inp = (id: string) => inputExpr(ctx, node, id);

  switch (node.type) {
    case "constNum":
      return literal(p, Number(config.value ?? 0));
    case "constBool":
      return p.bool(Boolean(config.value ?? true));
    case "constString":
      return literal(p, String(config.value ?? ""));
    case "andGate":
      return p.and(inp("a"), inp("b"));
    case "orGate":
      return p.or(inp("a"), inp("b"));
    case "notGate":
      return p.not(inp("a"));
    case "xorGate":
      return `(${inp("a")} != ${inp("b")})`;
    case "norGate":
      return p.not(p.or(inp("a"), inp("b")));
    case "nandGate":
      return p.not(p.and(inp("a"), inp("b")));
    case "condValue":
      return p.ternary(inp("condition"), inp("trueVal"), inp("falseVal"));
    case "compareNode": {
      const op = String(config.op ?? "==");
      // ==/!= compare raw values; ordering ops coerce to number, mirroring
      // the Number() casts in execution-helpers.
      if (op === "==" || op === "!=") return `(${inp("a")} ${op} ${inp("b")})`;
      return `(${p.num(inp("a"))} ${op} ${p.num(inp("b"))})`;
    }
    case "mathNode": {
      // Free-form formula over lettered inputs — substitute each connected
      // letter (either case) with its resolved expression.
      const vars: Record<string, string> = {};
      for (const port of node.data.inputs) {
        if (port.type === "data" && port.id !== "enabled") vars[port.id.toLowerCase()] = inp(port.id);
      }
      return `(${substituteFormula(String(config.expression ?? "a + b"), vars)})`;
    }
    case "expressionNode": {
      const vars: Record<string, string> = { x: inp("x"), y: inp("y") };
      return `(${substituteFormula(String(config.expression ?? "x * 2 + y"), vars)})`;
    }
    case "mathFunctionNode":
      return p.mathFn(String(config.op ?? "abs"), p.num(inp("a")), p.num(inp("b")));
    case "filterNode": {
      const found = p.strIncludes(
        config.caseSensitive ? p.str(inp("value")) : p.strLower(p.str(inp("value"))),
        config.caseSensitive ? p.str(inp("search")) : p.strLower(p.str(inp("search")))
      );
      const pass = (config.mode ?? "include") === "include" ? found : p.not(found);
      if (portId === "match") return pass;
      return p.ternary(pass, inp("value"), p.nil);
    }
    case "stringOpNode": {
      const text = p.str(inp("text"));
      const op = String(config.op ?? "uppercase");
      if (op === "uppercase") return p.strUpper(text);
      if (op === "lowercase") return p.strLower(text);
      if (op === "trim") return p.strTrim(text);
      if (op === "length") return p.strLen(text);
      if (op === "reverse") return p.strReverse(text);
      return text;
    }
    case "replaceTextNode":
      return p.strReplaceAll(p.str(inp("text")), p.str(inp("find")), p.str(inp("replace")));
    case "thresholdNeuron": {
      const fired =
        (config.mode ?? "above") === "below"
          ? `(${p.num(inp("value"))} < ${p.num(inp("threshold"))})`
          : `(${p.num(inp("value"))} > ${p.num(inp("threshold"))})`;
      if (portId === "fired") return fired;
      return p.ternary(fired, inp("value"), p.nil);
    }
    case "maxSelectorNode": {
      const items = node.data.inputs
        .filter((i) => i.type === "data" && i.id !== "enabled")
        .map((i) => p.num(inp(i.id)));
      return items.length ? p.maxOf(items) : "0";
    }
    case "synapseNode": {
      const scaled = `(${p.num(inp("in"))} * ${Number(config.weight ?? 1)})`;
      return config.inhibitory ? p.absNeg(scaled) : scaled;
    }
    case "rangeNode": {
      const v = p.num(inp("value"));
      const min = Number(config.min ?? 0);
      const max = Number(config.max ?? 0);
      if (portId === "above") return `(${v} > ${max})`;
      if (portId === "below") return `(${v} < ${min})`;
      if (portId === "inRange") return p.and(`${v} >= ${min}`, `${v} <= ${max}`);
      return stateVar(ctx, node, "count"); // running counter — chain-mutated state
    }
    // Stateful / trigger-driven nodes: their data outputs read variables that
    // the trigger-chain code mutates. Declared here so any read creates them.
    case "counterNode":
      return stateVar(ctx, node, "count");
    case "forLoopNode":
      return stateVar(ctx, node, "index");
    case "whileLoopNode":
      return stateVar(ctx, node, "iteration");
    case "leakyIntegrateFire":
      return stateVar(ctx, node, "potential");
    case "randomNode":
      return stateVar(ctx, node, "value");
    case "imageInputGrid": {
      const values = Array.isArray(config.cellValues) ? config.cellValues : [];
      addSetup(ctx, [
        ctx.profile.comment(`Image grid "${String(config.imageName || "unset")}" — ${values.length} luminosity values`),
        ctx.profile.declare(ctx.names.nameFor(node, "image_grid"), literal(p, values)),
      ]);
      return ctx.names.nameFor(node, "image_grid");
    }
    case "denseLayer":
    case "conv1dLayer":
    case "outputLayerNode":
      return neuralExpr(ctx, node, portId);
    case "pythonScript":
    case "ollamaLLM":
    case "ollamaVLM":
      return stateVar(ctx, node, node.type === "pythonScript" ? "result" : "response");
    default: {
      // Extended node library (Inputs / Logic / Math / Text / Lists / Outputs).
      const extra = extraOutputExpr(ctx, node, portId);
      if (extra !== null) return extra;
      // Device Lab connectivity nodes (see expressions-device.ts).
      const device = deviceOutputExpr(ctx, node, portId);
      if (device !== null) return device;
      ctx.warnings.push(`No emitter for node type "${node.type}" — emitted as null.`);
      return p.nil;
    }
  }
}

/** Starting value of a state variable, typed like the runtime's config field. */
function initialState(node: GraphNode, key: string): unknown {
  const cfg = node.data.config ?? {};
  if (node.type === "rangeNode" && key === "count") return Number(cfg.initialCount ?? 0);
  if (key === "state" || key === "fired") return Boolean(cfg[key]);
  if (key === "items" || key === "values") return Array.isArray(cfg[key]) ? cfg[key] : [];
  return Number(cfg[key] ?? 0);
}

/** Declare-once state variable for a stateful node's output; returns its name. */
export function stateVar(ctx: EmitCtx, node: GraphNode, key: string): string {
  const name = `${ctx.names.nameFor(node)}_${key}`;
  addSetup(ctx, [ctx.profile.declare(name, literal(ctx.profile, initialState(node, key)))]);
  ctx.stateVars.add(name);
  return name;
}

// AI-model layers carry real math (seeded weights + forward pass). Emitting
// the full helper library in every output would dwarf the user's logic, so
// they emit a call to a documented helper stub the reader can fill from
// src/lib/execution-helpers.ts (the reference implementation).
function neuralExpr(ctx: EmitCtx, node: GraphNode, portId: string): string {
  const p = ctx.profile;
  const cfg = node.data.config ?? {};
  const input = inputExpr(ctx, node, "in");
  if (node.type === "outputLayerNode") {
    if (portId === "winner") {
      addSetup(ctx, [p.comment("argmax helper — index of the strongest activation")]);
      return p.id === "python"
        ? `(${input}.index(max(${input})) if ${input} else -1)`
        : `${input}.indexOf(Math.max(...${input}))`;
    }
    return input;
  }
  const fn = node.type === "denseLayer" ? "dense_forward" : "conv1d_forward";
  addSetup(ctx, [
    p.comment(`${fn}: port the reference implementation from src/lib/execution-helpers.ts`),
    p.comment(`(seeded mulberry32 weights — seed ${Number(cfg.seed ?? 42)})`),
  ]);
  const args =
    node.type === "denseLayer"
      ? `${input}, ${Number(cfg.neurons ?? 8)}, ${Number(cfg.seed ?? 42)}, ${literal(p, String(cfg.activation ?? "sigmoid"))}`
      : `${input}, ${Number(cfg.filters ?? 4)}, ${Number(cfg.kernelSize ?? 3)}, ${Number(cfg.stride ?? 1)}, ${Number(cfg.seed ?? 42)}, ${literal(p, String(cfg.activation ?? "relu"))}`;
  return `${fn}(${args})`;
}
