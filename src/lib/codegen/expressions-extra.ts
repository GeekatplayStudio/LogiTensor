import type { GraphNode } from "./types";
import type { EmitCtx } from "./expressions";
import { inputExpr, stateVar } from "./expressions";
import { literal } from "./profiles";
import { requireHelper } from "./runtime-helpers";

// Data-output emitters for the extended node library (Inputs / Logic / Math /
// Data & Text / Lists / Outputs). Split out of expressions.ts to keep both
// modules under the repo's 500-line guardrail, mirroring how
// execution-helpers.ts delegates to extra-node-compute.ts + list-node-compute.ts
// — which are the semantic source of truth for everything below.

/** Clamp a number the same way the runtime does, at codegen time. */
function clampNumber(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));
}

/**
 * Returns the expression for one output port, or null if this module doesn't
 * own the node type (the caller then falls through to its own default).
 */
export function extraOutputExpr(ctx: EmitCtx, node: GraphNode, portId: string): string | null {
  const p = ctx.profile;
  const config = node.data.config ?? {};
  const inp = (id: string) => inputExpr(ctx, node, id);
  const call = (name: Parameters<typeof requireHelper>[1], ...args: string[]) =>
    `${requireHelper(ctx, name)}(${args.join(", ")})`;
  const num = (id: string) => p.num(inp(id));

  switch (node.type) {
    // --- Inputs ---------------------------------------------------------
    case "sliderInput":
      // Every operand is static config, so the clamp folds to one literal.
      return literal(p, clampNumber(Number(config.value ?? 0), Number(config.min ?? 0), Number(config.max ?? 100)));
    case "textAreaInput":
      return literal(p, String(config.value ?? ""));
    case "currentTimeNode":
      return portId === "formatted" ? p.nowFormatted : p.nowEpochMs;

    // --- Logic ----------------------------------------------------------
    case "xnorGate":
      return `(${p.boolCast(inp("a"))} == ${p.boolCast(inp("b"))})`;
    case "toggleNode":
    case "latchNode":
      // State lives in a variable the trigger chain flips (see chains.ts).
      return stateVar(ctx, node, "state");

    // --- Math & Compare -------------------------------------------------
    case "clampNode": {
      const lo = p.mathFn("min", num("min"), num("max"));
      const hi = p.mathFn("max", num("min"), num("max"));
      return p.mathFn("min", p.mathFn("max", num("value"), lo), hi);
    }
    case "mapRangeNode": {
      const outMin = num("outMin");
      const ratio = `((${num("value")} - ${num("inMin")}) / (${num("inMax")} - ${num("inMin")}))`;
      // A zero-width source range has no ratio — collapse to Out Min rather
      // than dividing by zero.
      return p.ternary(`${num("inMax")} == ${num("inMin")}`, outMin, `(${outMin} + ${ratio} * (${num("outMax")} - ${outMin}))`);
    }
    case "lerpNode":
      return `(${num("a")} + (${num("b")} - ${num("a")}) * ${num("t")})`;
    case "betweenNode": {
      const lo = p.mathFn("min", num("min"), num("max"));
      const hi = p.mathFn("max", num("min"), num("max"));
      const strict = (config.inclusive ?? true) === false;
      return p.and(`${num("value")} ${strict ? ">" : ">="} ${lo}`, `${num("value")} ${strict ? "<" : "<="} ${hi}`);
    }
    case "roundToNode": {
      // floor(x * f + 0.5) / f, not the language's round(): Python rounds
      // half-to-even, and both engines must agree with JS Math.round.
      const factor = 10 ** Math.max(0, Math.min(10, Math.trunc(Number(config.decimals ?? 2))));
      return `(${p.mathFn("floor", `${num("value")} * ${factor} + 0.5`, "0")} / ${factor})`;
    }

    // --- Data & Text ----------------------------------------------------
    case "splitTextNode": {
      const parts = call("lb_split", inp("text"), inp("delimiter"), literal(p, String(config.mode ?? "delimiter")));
      return portId === "count" ? p.strLen(parts) : parts;
    }
    case "joinTextNode":
      return call("lb_join", inp("list"), inp("delimiter"));
    case "substringNode":
      return call("lb_substring", inp("text"), inp("start"), inp("length"));
    case "templateNode": {
      // Auto-growing lettered inputs like the Formula node; both {a} and {A}
      // are accepted placeholders.
      let expr = literal(p, String(config.template ?? ""));
      for (const port of node.data.inputs) {
        if (port.type !== "data" || !/^[a-z]$/.test(port.id)) continue;
        const value = call("lb_to_str", inp(port.id));
        expr = p.strReplaceAll(expr, literal(p, `{${port.id}}`), value);
        expr = p.strReplaceAll(expr, literal(p, `{${port.id.toUpperCase()}}`), value);
      }
      return expr;
    }
    case "jsonParseNode":
      // helper returns [value, valid] — indexable in both languages.
      return `${call("lb_json_parse", inp("text"))}[${portId === "valid" ? 1 : 0}]`;
    case "jsonStringifyNode":
      return call("lb_json_stringify", inp("value"), p.bool(Boolean(config.pretty)));
    case "toNumberNode":
      return call("lb_to_num", inp("value"));
    case "toStringNode":
      return call("lb_to_str", inp("value"));
    case "toBooleanNode":
      return call("lb_to_bool", inp("value"));
    case "regexMatchNode":
      // helper returns [matched, first match].
      return `${call("lb_regex_match", inp("text"), inp("pattern"), p.bool(Boolean(config.ignoreCase)))}[${portId === "matched" ? 0 : 1}]`;

    // --- Lists ----------------------------------------------------------
    case "listLengthNode":
      return p.strLen(call("lb_to_list", inp("list")));
    case "listGetNode":
      // helper returns [item, found].
      return `${call("lb_list_get", inp("list"), inp("index"))}[${portId === "found" ? 1 : 0}]`;
    case "listStatsNode":
      return call("lb_list_stats", inp("list"), literal(p, String(config.op ?? "sum")));
    case "listSortNode":
      return call("lb_list_sort", inp("list"), p.bool(config.numeric ?? true), p.bool((config.direction ?? "asc") === "desc"));
    case "listSliceNode":
      return call("lb_list_slice", inp("list"), inp("start"), inp("end"));
    case "listContainsNode":
      // helper returns [contains, index].
      return `${call("lb_list_contains", inp("list"), inp("value"))}[${portId === "index" ? 1 : 0}]`;
    case "listFrequencyNode": {
      // helper returns [values, counts, report, unique] — indexable in both languages.
      const slot = { values: 0, counts: 1, report: 2, unique: 3 }[portId] ?? 0;
      const freq = call(
        "lb_list_frequency",
        inp("list"),
        p.bool(Boolean(config.caseSensitive)),
        literal(p, Math.trunc(Number(config.minCount ?? 1)) || 0),
        literal(p, Math.trunc(Number(config.topN ?? 0)) || 0),
      );
      return `${freq}[${slot}]`;
    }
    case "listUniqueNode":
      // helper returns [values, count].
      return `${call("lb_list_unique", inp("list"), p.bool(Boolean(config.caseSensitive)))}[${portId === "count" ? 1 : 0}]`;
    case "listCountItemNode":
      return call("lb_list_count_item", inp("list"), inp("item"), p.bool(Boolean(config.caseSensitive)));
    case "listAppendNode":
      return portId === "length" ? p.strLen(stateVar(ctx, node, "items")) : stateVar(ctx, node, "items");

    // --- Outputs --------------------------------------------------------
    case "assertNode":
      return call("lb_loose_eq", inp("value"), inp("expected"));
    case "valueListNode":
      return portId === "length" ? p.strLen(stateVar(ctx, node, "values")) : stateVar(ctx, node, "values");
    case "gaugeNode": {
      const lo = Number(config.min ?? 0);
      const hi = Number(config.max ?? 100);
      if (hi === lo) return "0"; // no span to fill — the runtime reports 0%
      const pct = `((${num("value")} - ${lo}) / ${hi - lo} * 100)`;
      return p.mathFn("min", "100", p.mathFn("max", "0", pct));
    }

    default:
      return null;
  }
}
