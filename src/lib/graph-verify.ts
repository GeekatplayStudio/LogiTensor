import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "@/types/nodes";
import { computeNodeOutputs } from "./execution-helpers";
import { auditConnectivity } from "./nl-apply";
import { generateCode } from "./codegen";

// Per-node verification of a graph BEFORE (or after) it lands on the canvas.
// Three passes: wiring audit (nl-apply), a real dry-run of every passive node
// through computeNodeOutputs in data-dependency order, and a codegen pass on
// the native targets so "the generated code is clean" is checked, not assumed.

export interface VerifyFinding {
  /** absent for graph-level findings (wiring, codegen) */
  nodeId?: string;
  label: string;
  level: "ok" | "warn" | "error";
  message: string;
}

export interface VerifyReport {
  findings: VerifyFinding[];
  errors: number;
  warnings: number;
  /** nodes whose compute actually ran during the dry-run */
  checkedNodes: number;
  /** resolved output values per passive node id (testgen reuses these) */
  passiveValues: Map<string, Record<string, unknown>>;
  summary: string;
}

const isTriggerDriven = (n: Node<NodeData>) => n.data.inputs.some((i) => i.type === "trigger");

/**
 * Dry-runs every passive node in data-dependency order, feeding each node the
 * real upstream values (or its ports' static defaults) and catching compute
 * throws. Trigger-driven nodes can't run without a trigger, so they are only
 * checked statically. Returns resolved values + per-node findings.
 */
export function resolvePassiveOutputs(
  nodes: Node<NodeData>[],
  edges: Edge[]
): { values: Map<string, Record<string, unknown>>; findings: VerifyFinding[] } {
  const values = new Map<string, Record<string, unknown>>();
  const findings: VerifyFinding[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dataEdges = edges.filter((e) => {
    const src = byId.get(e.source);
    return src?.data.outputs.find((o) => o.id === e.sourceHandle)?.type === "data";
  });

  const resolving = new Set<string>();
  const resolve = (id: string): Record<string, unknown> | undefined => {
    if (values.has(id)) return values.get(id);
    const node = byId.get(id);
    if (!node) return undefined;
    if (resolving.has(id)) {
      findings.push({
        nodeId: id,
        label: node.data.label,
        level: "warn",
        message: "is part of a data-wire cycle — its value cannot settle.",
      });
      return undefined;
    }
    if (isTriggerDriven(node)) return undefined; // runs only when triggered
    resolving.add(id);

    const inputs: Record<string, unknown> = {};
    for (const port of node.data.inputs) {
      if (port.type !== "data") continue;
      const feed = dataEdges.find((e) => e.target === id && e.targetHandle === port.id);
      if (feed) {
        const upstream = resolve(feed.source);
        inputs[port.id] = upstream?.[feed.sourceHandle ?? ""];
      } else if (port.value !== undefined) {
        inputs[port.id] = port.value;
      }
    }
    resolving.delete(id);

    try {
      const out = computeNodeOutputs(node.data.type, inputs, node.data.config ?? {});
      values.set(id, out);
      return out;
    } catch (err) {
      findings.push({
        nodeId: id,
        label: node.data.label,
        level: "error",
        message: `compute threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      return undefined;
    }
  };

  for (const n of nodes) if (!isTriggerDriven(n)) resolve(n.id);
  return { values, findings };
}

/**
 * Re-derives the exact input record a passive node was computed with, from an
 * already-complete `resolvePassiveOutputs` values map — testgen uses this to
 * emit (inputs, config) → expected-outputs vectors.
 */
export function resolvedInputsFor(
  node: Node<NodeData>,
  nodes: Node<NodeData>[],
  edges: Edge[],
  values: Map<string, Record<string, unknown>>
): Record<string, unknown> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inputs: Record<string, unknown> = {};
  for (const port of node.data.inputs) {
    if (port.type !== "data") continue;
    const feed = edges.find((e) => {
      if (e.target !== node.id || e.targetHandle !== port.id) return false;
      const src = byId.get(e.source);
      return src?.data.outputs.find((o) => o.id === e.sourceHandle)?.type === "data";
    });
    if (feed) inputs[port.id] = values.get(feed.source)?.[feed.sourceHandle ?? ""];
    else if (port.value !== undefined) inputs[port.id] = port.value;
  }
  return inputs;
}

/** Full verification: wiring + per-node dry-run + native codegen check. */
export function verifyGraph(nodes: Node<NodeData>[], edges: Edge[]): VerifyReport {
  const findings: VerifyFinding[] = [];

  for (const note of auditConnectivity(nodes, edges)) {
    findings.push({ label: "Wiring", level: "warn", message: note });
  }

  const { values, findings: computeFindings } = resolvePassiveOutputs(nodes, edges);
  findings.push(...computeFindings);

  // A passive node that resolved to all-undefined outputs usually means its
  // inputs never arrived — flag it so "it built but shows nothing" is visible.
  for (const [id, out] of values) {
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    const dataOuts = node.data.outputs.filter((o) => o.type === "data");
    if (dataOuts.length > 0 && dataOuts.every((o) => out[o.id] === undefined)) {
      findings.push({
        nodeId: id,
        label: node.data.label,
        level: "warn",
        message: "produced no output values — check its inputs.",
      });
    }
  }

  // Generated-code check on both native targets (derived targets share their
  // structure, so a clean native emission means the family is clean).
  for (const target of ["typescript", "python"]) {
    for (const w of generateCode(nodes, edges, target).warnings) {
      findings.push({ label: `Codegen (${target})`, level: "warn", message: w });
    }
  }

  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warn").length;
  const summary =
    errors || warnings
      ? `Verified ${values.size} node computation(s): ${errors} error(s), ${warnings} warning(s).`
      : `Verified ${values.size} node computation(s) — all clean, generated code has no warnings.`;

  return { findings, errors, warnings, checkedNodes: values.size, passiveValues: values, summary };
}
