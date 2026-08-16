import type { Edge } from "@xyflow/react";
import type { GraphNode, LanguageProfile, GenerateResult } from "./types";
import { GraphView, NameAllocator, indent } from "./graph";
import type { EmitCtx } from "./expressions";
import { outputExpr } from "./expressions";
import { chainFrom, stepInto } from "./chains";

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
  };
  const unit = profile.id === "python" ? "    " : "  ";

  // 1. One function per Manual Trigger (the graph's entry points).
  const triggerFns: { name: string; body: string[] }[] = [];
  for (const node of nodes) {
    if (node.type !== "triggerInput") continue;
    ctx.emitted.add(node.id);
    const body = chainFrom(ctx, node, "triggerOut", new Set());
    triggerFns.push({ name: `run_${ctx.names.nameFor(node, "trigger")}`, body: body.length ? body : [profile.emptyBody] });
  }

  // 2. Nodes no trigger chain reaches. Without this, a graph with no Manual
  // Trigger (or a side-effecting node left unwired) generated nothing at all —
  // its whole logic was invisible in the panel. Their action is emitted under
  // a labeled section so it's clear nothing triggers them yet.
  const unreached: string[] = [];
  for (const node of nodes) {
    if (ctx.emitted.has(node.id)) continue;
    const triggerIn = node.data.inputs.find((i) => i.type === "trigger");
    if (!triggerIn) continue;
    unreached.push(...stepInto(ctx, node, triggerIn.id, new Set()));
  }

  // 3. Terminal data outputs (wired to nothing) — print them in main so pure
  // data graphs generate runnable, observable programs.
  const terminals: string[] = [];
  for (const node of nodes) {
    for (const port of node.data.outputs) {
      if (port.type !== "data") continue;
      if (graph.edgesFrom(node.id, port.id).length > 0) continue;
      if (node.type === "triggerInput" || node.type === "imageInputGrid") continue;
      terminals.push(profile.print(`${JSON.stringify(`${node.data.label}.${port.name} =`)}, ${outputExpr(ctx, node, port.id)}`));
    }
  }

  // 3. Compose. Setup is collected as a side effect of the emissions above.
  const lines: string[] = [];
  if (profile.id === "python") {
    lines.push("import math, random, time, json, urllib.request", "");
  } else {
    lines.push("const sleep = (ms) => new Promise((r) => setTimeout(r, ms));", "");
  }
  for (const block of ctx.setup.values()) lines.push(...block, "");
  for (const fn of triggerFns) {
    lines.push(profile.defLine(fn.name, []));
    lines.push(...indent(fn.body, unit));
    if (profile.blockClose) lines.push(profile.blockClose);
    lines.push("");
  }
  const main: string[] = [
    ...triggerFns.map((fn) => profile.callStmt(fn.name, [])),
    ...(unreached.length ? [profile.comment("not reached by any trigger — wire a Manual Trigger to run these"), ...unreached] : []),
    ...terminals,
  ];
  if (main.length === 0) main.push(profile.comment("empty graph"));
  if (profile.id === "python") {
    lines.push('if __name__ == "__main__":');
    lines.push(...indent(main, unit));
  } else {
    lines.push("async function main() {");
    lines.push(...indent(main, unit));
    lines.push("}", "", "main();");
  }

  return { code: lines.join("\n") + "\n", warnings: ctx.warnings };
}
