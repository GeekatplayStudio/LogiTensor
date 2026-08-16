import type { Node, Edge } from "@xyflow/react";
import { NODE_DEFINITIONS, type NodeData } from "@/types/nodes";

// Validates and materializes an LLM-proposed graph. The model's output is
// untrusted: every node type, port and edge endpoint is checked against
// NODE_DEFINITIONS, and nodes are rebuilt from the real definitions (the LLM
// only chooses type/config/wiring — it can never inject ports or code).

export interface NlGraphSpec {
  nodes?: { id?: string; type?: string; config?: Record<string, unknown> }[];
  edges?: { source?: string; sourceHandle?: string; target?: string; targetHandle?: string }[];
}

export interface NlApplyResult {
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** per-item problems — rejected items are skipped, the rest still applies */
  problems: string[];
  /** post-build wiring audit (unconnected nodes, missing triggers, …) */
  connectivity: string[];
}

/** Compact schema of every node type, sent to the model as its vocabulary. */
export function buildNodeSchema(): object[] {
  return Object.values(NODE_DEFINITIONS).map((def) => ({
    type: def.type,
    description: def.description,
    inputs: def.inputs.map((i) => `${i.id}(${i.type === "trigger" ? "trigger" : i.dataType})`),
    outputs: def.outputs.map((o) => `${o.id}(${o.type === "trigger" ? "trigger" : o.dataType})`),
    config: def.config ?? {},
  }));
}

export function materializeNlGraph(spec: NlGraphSpec, idPrefix = `nl_${Date.now()}`): NlApplyResult {
  const problems: string[] = [];
  const nodes: Node<NodeData>[] = [];
  const idMap = new Map<string, string>();

  for (const [i, n] of (spec.nodes ?? []).entries()) {
    const def = n.type ? NODE_DEFINITIONS[n.type] : undefined;
    if (!def) {
      problems.push(`Unknown node type "${n.type}" — skipped.`);
      continue;
    }
    const id = `${idPrefix}_${i}`;
    idMap.set(String(n.id ?? i), id);
    // Config is filtered to keys the definition declares — the model cannot
    // introduce arbitrary state (pythonScript.code is the one free-form key
    // its own definition declares, and it runs sandboxed server-side anyway).
    const config: Record<string, unknown> = { ...(def.config ?? {}) };
    for (const [k, v] of Object.entries(n.config ?? {})) {
      if (k in config) config[k] = v;
      else problems.push(`${def.label}: config key "${k}" not recognized — ignored.`);
    }
    nodes.push({
      id,
      type: def.type,
      position: { x: 0, y: 0 }, // replaced by autoLayout below
      data: {
        label: def.label,
        type: def.type,
        inputs: def.inputs.map((p) => ({ ...p })),
        outputs: def.outputs.map((p) => ({ ...p })),
        config: config as NodeData["config"],
        executionState: "idle",
      },
    });
  }

  const edges: Edge[] = [];
  for (const e of spec.edges ?? []) {
    // Weak models routinely emit half-null edges; drop them quietly rather
    // than reporting a confusing "endpoint not found" for an obvious non-edge.
    if (!e.source || !e.target || !e.sourceHandle || !e.targetHandle) continue;
    const source = idMap.get(String(e.source));
    const target = idMap.get(String(e.target));
    const srcNode = nodes.find((n) => n.id === source);
    const tgtNode = nodes.find((n) => n.id === target);
    const srcPort = srcNode?.data.outputs.find((o) => o.id === e.sourceHandle);
    const tgtPort = tgtNode?.data.inputs.find((i) => i.id === e.targetHandle);
    if (!srcNode || !tgtNode || !srcPort || !tgtPort) {
      problems.push(`Edge ${e.source}.${e.sourceHandle} → ${e.target}.${e.targetHandle}: endpoint not found — skipped.`);
      continue;
    }
    // Same wiring rule as onConnect: types must match, except boolean/number/
    // any data may drive a trigger input (the hybrid-trigger feature).
    const hybridOk =
      tgtPort.type === "trigger" &&
      srcPort.type === "data" &&
      ["boolean", "number", "any"].includes(srcPort.dataType ?? "");
    if (srcPort.type !== tgtPort.type && !hybridOk) {
      problems.push(`Edge ${srcNode.data.label}.${srcPort.id} → ${tgtNode.data.label}.${tgtPort.id}: incompatible socket types — skipped.`);
      continue;
    }
    edges.push({
      id: `${source}-${target}-${tgtPort.id}`,
      source: source!,
      sourceHandle: srcPort.id,
      target: target!,
      targetHandle: tgtPort.id,
    });
  }

  autoLayout(nodes, edges);
  return { nodes, edges, problems, connectivity: auditConnectivity(nodes, edges) };
}

/**
 * Post-build wiring audit. The model can return a syntactically valid graph
 * whose nodes are simply not wired together — which looked like "it added
 * nodes but nothing works". Surfacing this explicitly turns a silent failure
 * into a visible, actionable one.
 */
export function auditConnectivity(nodes: Node<NodeData>[], edges: Edge[]): string[] {
  const notes: string[] = [];
  const wired = new Set<string>();
  for (const e of edges) {
    wired.add(e.source);
    wired.add(e.target);
  }

  for (const n of nodes) {
    if (!wired.has(n.id)) {
      notes.push(`${n.data.label} is not connected to anything.`);
      continue;
    }
    // A trigger-driven node that nothing ever fires will never execute.
    const triggerIns = n.data.inputs.filter((i) => i.type === "trigger");
    if (triggerIns.length > 0) {
      const fired = triggerIns.some((i) => edges.some((e) => e.target === n.id && e.targetHandle === i.id));
      if (!fired) notes.push(`${n.data.label} has no trigger wired — it will never run.`);
    }
    // Data inputs left at their default when the flow clearly meant to feed them.
    for (const port of n.data.inputs) {
      if (port.type !== "data" || port.id === "enabled") continue;
      const fed = edges.some((e) => e.target === n.id && e.targetHandle === port.id);
      if (!fed && port.value === undefined) {
        notes.push(`${n.data.label}.${port.name} has no value and nothing wired into it.`);
      }
    }
  }

  if (nodes.some((n) => n.data.inputs.some((i) => i.type === "trigger")) &&
      !nodes.some((n) => n.type === "triggerInput")) {
    notes.push("No Manual Trigger in the flow — add one to be able to run it.");
  }
  return notes;
}

// Layered left-to-right placement by topological depth — enough for the small
// graphs NL requests produce, without pulling in a layout dependency.
function autoLayout(nodes: Node<NodeData>[], edges: Edge[]): void {
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle — leave at column 0
    seen.add(id);
    const incoming = edges.filter((e) => e.target === id);
    const d = incoming.length ? Math.max(...incoming.map((e) => depthOf(e.source, seen) + 1)) : 0;
    depth.set(id, d);
    return d;
  };
  const perColumn = new Map<number, number>();
  for (const n of nodes) {
    const d = depthOf(n.id, new Set());
    const row = perColumn.get(d) ?? 0;
    perColumn.set(d, row + 1);
    n.position = { x: 80 + d * 300, y: 80 + row * 190 };
  }
}
