import { describe, it, expect } from "vitest";
import { materializeNlGraph } from "../nl-apply";
import { verifyGraph, resolvePassiveOutputs, resolvedInputsFor } from "../graph-verify";

// Graphs are built through materializeNlGraph so the tests exercise the same
// path Build Logic uses: LLM-shaped spec in, real canvas nodes out.

const sumSpec = {
  nodes: [
    { id: "n1", type: "constNum", config: { value: 2 } },
    { id: "n2", type: "constNum", config: { value: 3 } },
    { id: "n3", type: "mathNode", config: { expression: "a + b" } },
  ],
  edges: [
    { source: "n1", sourceHandle: "value", target: "n3", targetHandle: "a" },
    { source: "n2", sourceHandle: "value", target: "n3", targetHandle: "b" },
  ],
};

describe("resolvePassiveOutputs", () => {
  it("dry-runs a passive chain with real upstream values", () => {
    const { nodes, edges } = materializeNlGraph(sumSpec, "t");
    const { values, findings } = resolvePassiveOutputs(nodes, edges);
    expect(findings).toEqual([]);
    expect(values.get("t_0")).toEqual({ value: 2 });
    expect(values.get("t_2")?.out).toBe(5);
  });

  it("re-derives the inputs a node was computed with", () => {
    const { nodes, edges } = materializeNlGraph(sumSpec, "t");
    const { values } = resolvePassiveOutputs(nodes, edges);
    const math = nodes.find((n) => n.data.type === "mathNode")!;
    expect(resolvedInputsFor(math, nodes, edges, values)).toMatchObject({ a: 2, b: 3 });
  });
});

describe("verifyGraph", () => {
  it("reports a fully wired computing graph as clean", () => {
    const { nodes, edges } = materializeNlGraph(sumSpec, "t");
    const report = verifyGraph(nodes, edges);
    expect(report.errors).toBe(0);
    expect(report.checkedNodes).toBe(3);
    expect(report.summary).toContain("all clean");
  });

  it("flags unconnected nodes as warnings", () => {
    const { nodes, edges } = materializeNlGraph(
      { nodes: [{ id: "n1", type: "constNum", config: { value: 1 } }], edges: [] },
      "t"
    );
    const report = verifyGraph(nodes, edges);
    expect(report.errors).toBe(0);
    expect(report.findings.some((f) => f.message.includes("not connected"))).toBe(true);
  });
});
