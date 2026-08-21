import type { Edge } from "@xyflow/react";
import type { CodeLine, GraphNode, LanguageProfile, GenerateResult } from "./types";
import { GraphView, NameAllocator } from "./graph";
import { indentLines, joinLines, tag } from "./lines";
import type { EmitCtx } from "./expressions";
import { outputExpr } from "./expressions";
import { chainFrom, stepInto } from "./chains";
import { flushPending, nodeComment, resetScope } from "./materialize";

// Assembles a full program for one native language: header imports → setup
// (state vars + helpers, content-deduped) → one function per Manual Trigger →
// a main section that runs every trigger, then prints unconsumed data outputs
// so a bare data-flow graph (no triggers) still produces observable code.

export function assembleNative(nodes: GraphNode[], edges: Edge[], profile: LanguageProfile): GenerateResult {
  const graph = new GraphView(nodes, edges);
  const ctx: EmitCtx = {
    graph,
    profile,
    names: new NameAllocator(),
    setup: new Map(),
    warnings: [],
    visiting: new Set(),
    emitted: new Set(),
    pending: [],
    materialized: new Map(),
    noMaterialize: 0,
    stateVars: new Set(),
  };
  const unit = profile.id === "python" ? "    " : "  ";

  // 1. One function per Manual Trigger (the graph's entry points).
  const triggerFns: { name: string; body: CodeLine[]; nodeId: string }[] = [];
  for (const node of nodes) {
    if (node.type !== "triggerInput") continue;
    ctx.emitted.add(node.id);
    // Each generated function is its own variable scope.
    resetScope(ctx);
    const body = chainFrom(ctx, node, "triggerOut", new Set());
    triggerFns.push({
      name: `run_${ctx.names.nameFor(node, "trigger")}`,
      body: body.length ? body : tag([profile.emptyBody], node.id),
      nodeId: node.id,
    });
  }

  // 2. Nodes no trigger chain reaches. Without this, a graph with no Manual
  // Trigger (or a side-effecting node left unwired) generated nothing at all —
  // its whole logic was invisible in the panel. Their action is emitted under
  // a labeled section so it's clear nothing triggers them yet.
  // Steps 2 and 3 both emit into `main`, so they share one variable scope.
  resetScope(ctx);
  const unreached: CodeLine[] = [];
  for (const node of nodes) {
    if (ctx.emitted.has(node.id)) continue;
    const triggerIn = node.data.inputs.find((i) => i.type === "trigger");
    if (!triggerIn) continue;
    unreached.push(...stepInto(ctx, node, triggerIn.id, new Set()));
  }

  // 3. Terminal data outputs (wired to nothing) — print them in main so pure
  // data graphs generate runnable, observable programs.
  const terminals: CodeLine[] = [];
  for (const node of nodes) {
    for (const port of node.data.outputs) {
      if (port.type !== "data") continue;
      if (graph.edgesFrom(node.id, port.id).length > 0) continue;
      if (node.type === "triggerInput" || node.type === "imageInputGrid") continue;
      const expr = outputExpr(ctx, node, port.id);
      // The node's own named assignment (if any) has to precede the print, and
      // already carries the naming comment; otherwise add one here.
      const declared = flushPending(ctx);
      terminals.push(...(declared.length ? declared : tag([profile.comment(nodeComment(node))], node.id)));
      terminals.push(...tag([profile.print(`${JSON.stringify(`${node.data.label}.${port.name} =`)}, ${expr}`)], node.id));
    }
  }

  // 3. Compose. Setup is collected as a side effect of the emissions above.
  // Imports and shared helpers belong to no single node — they stay untagged.
  const lines: CodeLine[] = [];
  if (profile.id === "python") {
    lines.push(...tag(["import math, random, re, time, json, urllib.request", ""]));
  } else {
    lines.push(...tag(["const sleep = (ms) => new Promise((r) => setTimeout(r, ms));", ""]));
  }
  for (const block of ctx.setup.values()) lines.push(...tag([...block, ""]));
  for (const fn of triggerFns) {
    // The def/close scaffolding belongs to the trigger node; the body lines
    // keep the tags of whichever nodes produced them.
    lines.push(...tag([profile.defLine(fn.name, [])], fn.nodeId));
    // Python: module-level state (counters, toggles, latches …) assigned
    // inside a function rebinds a local without this — the read before the
    // assignment then raises UnboundLocalError. JS closures need nothing.
    if (profile.id === "python" && ctx.stateVars.size > 0) {
      lines.push(...tag([`${unit}global ${[...ctx.stateVars].join(", ")}`], fn.nodeId));
    }
    lines.push(...indentLines(fn.body, unit));
    if (profile.blockClose) lines.push(...tag([profile.blockClose], fn.nodeId));
    lines.push(...tag([""], fn.nodeId));
  }
  const main: CodeLine[] = [
    ...triggerFns.map((fn) => ({ text: profile.callStmt(fn.name, []), nodeId: fn.nodeId })),
    ...(unreached.length ? [...tag([profile.comment("not reached by any trigger — wire a Manual Trigger to run these")]), ...unreached] : []),
    ...terminals,
  ];
  // emptyBody as well as the note: a Python block made only of comments is an
  // IndentationError, so `main` always needs one real statement.
  if (main.length === 0) main.push(...tag([profile.comment("empty graph"), profile.emptyBody]));
  if (profile.id === "python") {
    lines.push(...tag(['if __name__ == "__main__":']));
    lines.push(...indentLines(main, unit));
  } else {
    lines.push(...tag(["async function main() {"]));
    lines.push(...indentLines(main, unit));
    lines.push(...tag(["}", "", "main();"]));
  }

  return { code: joinLines(lines), lines, warnings: ctx.warnings };
}
