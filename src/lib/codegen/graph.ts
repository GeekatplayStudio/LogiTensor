import type { Edge } from "@xyflow/react";
import type { GraphNode } from "./types";

// Read-only view over the canvas graph with the lookups codegen needs.
// Kept separate from the Zustand store so generateCode stays a pure function
// testable without a store (same property that made ash-mesh's codegen
// unit-testable: `(graph, target) -> code` touches no UI state).
export class GraphView {
  readonly nodes: GraphNode[];
  private byId = new Map<string, GraphNode>();
  private dataInto = new Map<string, Edge>();
  private triggersFrom = new Map<string, Edge[]>();

  constructor(nodes: GraphNode[], edges: Edge[]) {
    this.nodes = nodes;
    for (const n of nodes) this.byId.set(n.id, n);
    for (const e of edges) {
      // An input port holds at most one data edge (enforced by onConnect),
      // so a flat map keyed by target+port is sufficient.
      this.dataInto.set(`${e.target}:${e.targetHandle}`, e);
      const key = `${e.source}:${e.sourceHandle}`;
      const list = this.triggersFrom.get(key) ?? [];
      list.push(e);
      this.triggersFrom.set(key, list);
    }
  }

  node(id: string): GraphNode | undefined {
    return this.byId.get(id);
  }

  /** The edge feeding a node's input port, if wired. */
  edgeInto(nodeId: string, portId: string): Edge | undefined {
    return this.dataInto.get(`${nodeId}:${portId}`);
  }

  /** All edges leaving a node's output port (trigger ports can fan out). */
  edgesFrom(nodeId: string, portId: string): Edge[] {
    return this.triggersFrom.get(`${nodeId}:${portId}`) ?? [];
  }

  /** Static value declared on an input port (used when the port is unwired). */
  staticValue(nodeId: string, portId: string): unknown {
    return this.byId.get(nodeId)?.data.inputs.find((i) => i.id === portId)?.value;
  }
}

// Short, stable, human-readable identifiers for generated variables/functions.
// Node ids look like "counterNode_1712345_3" — unusable as reader-facing
// names, so each node gets "<type-stem>_<n>" allocated in first-use order.
export class NameAllocator {
  private names = new Map<string, string>();
  private used = new Map<string, number>();

  nameFor(node: GraphNode, stem?: string): string {
    const existing = this.names.get(node.id);
    if (existing) return existing;
    const base = (stem ?? (node.type || "node").replace(/Node$|Trigger$|Gate$/i, "")).toLowerCase();
    const n = (this.used.get(base) ?? 0) + 1;
    this.used.set(base, n);
    const name = `${base}_${n}`;
    this.names.set(node.id, name);
    return name;
  }
}

/** Prefix every line with one indent unit (2 spaces in JS, 4 in Python). */
export function indent(lines: string[], unit: string): string[] {
  return lines.map((l) => (l === "" ? l : unit + l));
}
