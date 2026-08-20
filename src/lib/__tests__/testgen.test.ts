import { describe, it, expect } from "vitest";
import { materializeNlGraph } from "../nl-apply";
import { generateTestFile } from "../codegen/testgen";

const spec = {
  nodes: [
    { id: "n1", type: "constNum", config: { value: 2 } },
    { id: "n2", type: "constNum", config: { value: 3 } },
    { id: "n3", type: "mathNode", config: { expression: "a + b" } },
    { id: "n4", type: "constBool", config: { value: true } },
  ],
  edges: [
    { source: "n1", sourceHandle: "value", target: "n3", targetHandle: "a" },
    { source: "n2", sourceHandle: "value", target: "n3", targetHandle: "b" },
  ],
};

describe("generateTestFile", () => {
  it("emits a vitest file asserting each node's resolved outputs", () => {
    const { nodes, edges } = materializeNlGraph(spec, "t");
    const t = generateTestFile(nodes, edges, "typescript");
    expect(t.target).toBe("typescript");
    expect(t.code).toContain('import { computeNodeOutputs } from "@/lib/execution-helpers";');
    expect(t.code).toContain('computeNodeOutputs("mathNode"');
    expect(t.code).toContain('expect(out["out"]).toEqual(5);');
    // every test line carries its source node for the viewer's gutter map
    expect(t.lines.some((l) => l.nodeId === "t_2")).toBe(true);
  });

  it("emits pytest with Python literals when the panel target is python", () => {
    const { nodes, edges } = materializeNlGraph(spec, "t");
    const t = generateTestFile(nodes, edges, "python");
    expect(t.target).toBe("python");
    expect(t.code).toContain("from backend.engine import execute_logic_computation");
    expect(t.code).toContain('assert out["out"] == 5');
    expect(t.code).toContain("True"); // constBool serialized as a Python literal
    expect(t.code).not.toContain(": true"); // no JS booleans leak through
  });

  it("lists trigger-driven nodes as not covered instead of silently dropping them", () => {
    const { nodes, edges } = materializeNlGraph(
      {
        nodes: [
          { id: "n1", type: "loggerNode", config: {} },
          { id: "n2", type: "constNum", config: { value: 1 } },
        ],
        edges: [],
      },
      "t"
    );
    const t = generateTestFile(nodes, edges, "typescript");
    expect(t.skipped.some((s) => s.includes("trigger-driven"))).toBe(true);
    expect(t.code).toContain("Not covered:");
  });
});
