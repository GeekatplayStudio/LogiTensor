import type { CodeLine, GraphNode, LanguageProfile } from "./types";
import type { GraphView, NameAllocator } from "./graph";
import { tag } from "./lines";

// Named intermediate variables for data nodes.
//
// Expression threading (expressions.ts) used to splice every upstream node's
// expression straight into its consumer, so a chain of ten data nodes collapsed
// into one unreadable line and — worse — no emitted line belonged to any of the
// intermediate nodes, leaving the code panel's highlight/breakpoint gutter with
// nothing to target. Instead, a data node's expression is assigned to a named
// variable the first time it is needed; consumers reference the name.
//
// Placement: the assignment is buffered in `pending` and flushed by the caller
// immediately before the statement that needs it, so evaluation order is
// preserved (a producer is always assigned above its consumer) and the variable
// lands in the same block as its use rather than being hoisted out of a loop.
//
// Structural ctx (rather than importing EmitCtx) keeps this module free of an
// import cycle with expressions.ts — same trick runtime-helpers.ts uses.
export interface MaterializeCtx {
  profile: LanguageProfile;
  graph: GraphView;
  names: NameAllocator;
  /** assignments awaiting the next statement flush */
  pending: CodeLine[];
  /** `nodeId:portId` -> variable name, valid for the current block scope */
  materialized: Map<string, string>;
  /** >0 while emitting an expression that must NOT be hoisted (loop conditions) */
  noMaterialize: number;
}

// Constants are already as readable inlined as they'd be behind a name, so they
// stay inlined — EXCEPT when several consumers read them, where a shared name
// documents that they really are the same value.
const TRIVIAL_CONST = new Set(["constNum", "constBool", "constString", "sliderInput", "textAreaInput"]);

const IDENTIFIER = /^[A-Za-z_]\w*$/;

// Config fields worth showing in the naming comment: they are what makes two
// nodes of the same type behave differently (Math Function's op, Formula's
// expression, Filter's mode).
const DETAIL_KEYS = ["op", "expression", "mode"];

/** Short human label for a node: "Math Function (abs)". */
export function nodeComment(node: GraphNode): string {
  const config = node.data.config ?? {};
  for (const key of DETAIL_KEYS) {
    const value = config[key];
    if (typeof value === "string" && value.trim() !== "") return `${node.data.label} (${value.trim()})`;
  }
  return node.data.label;
}

function shouldMaterialize(ctx: MaterializeCtx, node: GraphNode, portId: string, expr: string): boolean {
  if (ctx.noMaterialize > 0) return false;
  // Already a variable (stateful nodes, image grids) — naming it again would
  // only add an alias.
  if (IDENTIFIER.test(expr)) return false;
  if (TRIVIAL_CONST.has(node.type ?? "")) return ctx.graph.edgesFrom(node.id, portId).length > 1;
  return true;
}

/**
 * Give one data output a name, or return the expression unchanged when naming
 * it would not help. Queues `# Label` + `name = expr` for the next flush.
 */
export function materializeOutput(ctx: MaterializeCtx, node: GraphNode, portId: string, expr: string): string {
  if (!shouldMaterialize(ctx, node, portId, expr)) return expr;
  const name = `${ctx.names.nameFor(node)}_${portId}`;
  ctx.pending.push(...tag([ctx.profile.comment(nodeComment(node)), ctx.profile.declare(name, expr)], node.id));
  ctx.materialized.set(`${node.id}:${portId}`, name);
  return name;
}

/** Take the buffered assignments, to be placed above the statement using them. */
export function flushPending(ctx: MaterializeCtx): CodeLine[] {
  const lines = ctx.pending;
  ctx.pending = [];
  return lines;
}

/**
 * Run `fn` in a nested block scope. Variables named by the parent stay visible
 * (they were assigned above), but names created inside the block do not leak
 * out — otherwise a consumer after an `if` could reference a variable that only
 * one branch assigns.
 */
export function scoped<T>(ctx: MaterializeCtx, fn: () => T): T {
  const saved = new Map(ctx.materialized);
  try {
    return fn();
  } finally {
    ctx.materialized = saved;
  }
}

/** Start a fresh scope (one per generated function, plus the main section). */
export function resetScope(ctx: MaterializeCtx): void {
  ctx.materialized = new Map();
}

/**
 * Emit `fn`'s expression fully inlined. Used for a `while` condition, which has
 * to be re-evaluated on every iteration — hoisting it above the loop would
 * freeze it and never terminate.
 */
export function withoutMaterialization<T>(ctx: MaterializeCtx, fn: () => T): T {
  ctx.noMaterialize += 1;
  try {
    return fn();
  } finally {
    ctx.noMaterialize -= 1;
  }
}
