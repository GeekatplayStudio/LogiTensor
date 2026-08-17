import { describe, it, expect } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "@/types/nodes";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { auditExecutionOrder, buildRunReport, formatRunReportMarkdown, type LastRunInfo } from "../run-report";

function makeNode(type: string, id: string, label?: string): Node<NodeData> {
  const def = NODE_DEFINITIONS[type];
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label: label ?? def.label,
      type,
      inputs: def.inputs.map((i) => ({ ...i })),
      outputs: def.outputs.map((o) => ({ ...o })),
      config: { ...(def.config ?? {}) },
    },
  };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return { id: `${source}:${sourceHandle}->${target}:${targetHandle}`, source, sourceHandle, target, targetHandle };
}

// Two Random Number nodes; only rand_a is wired to the Manual Trigger.
function twoRandomGraph() {
  const nodes = [
    makeNode("triggerInput", "trig_1"),
    makeNode("randomNode", "rand_a", "Random A"),
    makeNode("randomNode", "rand_b", "Random B"),
  ];
  const edges = [edge("trig_1", "triggerOut", "rand_a", "inTrigger")];
  return { nodes, edges };
}

const lastRun: LastRunInfo = {
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_000_500,
  durationMs: 500,
  success: true,
  loops: 1,
  trace: ["trig_1", "rand_a"],
  backendLogs: ["INFO: graph compiled"],
  outputs: { rand_a: { value: 42 } },
};

describe("buildRunReport", () => {
  it("names the unwired duplicate in 'never executed' with a no-trigger reason", () => {
    const { nodes, edges } = twoRandomGraph();
    const report = buildRunReport({ nodes, edges, lastRun });

    const missing = report.neverExecuted.find((n) => n.nodeId === "rand_b");
    expect(missing).toBeDefined();
    expect(missing?.label).toBe("Random B");
    expect(missing?.reason).toMatch(/nothing drives it/i);
    expect(report.neverExecuted.some((n) => n.nodeId === "rand_a")).toBe(false);
  });

  it("reports duplicate-type instances with their execution counts", () => {
    const { nodes, edges } = twoRandomGraph();
    const report = buildRunReport({ nodes, edges, lastRun });

    const group = report.duplicateTypes.find((g) => g.type === "randomNode");
    expect(group).toBeDefined();
    const counts = Object.fromEntries(group!.instances.map((i) => [i.nodeId, i.executions]));
    expect(counts).toEqual({ rand_a: 1, rand_b: 0 });
    const b = group!.instances.find((i) => i.nodeId === "rand_b");
    expect(b?.incomingTriggerEdges).toBe(0);
  });

  it("records the ordered trace and per-node detail", () => {
    const { nodes, edges } = twoRandomGraph();
    const report = buildRunReport({ nodes, edges, lastRun });

    expect(report.trace.map((s) => s.nodeId)).toEqual(["trig_1", "rand_a"]);
    const detail = report.nodeDetails.find((d) => d.nodeId === "rand_a");
    expect(detail?.incoming).toHaveLength(1);
    expect(detail?.incoming[0].toPort).toBe("inTrigger");
    expect(detail?.traceEligible).toBe(true);
  });

  it("marks passive data nodes as never-traced by design", () => {
    const nodes = [makeNode("constNum", "num_1")];
    const report = buildRunReport({ nodes, edges: [], lastRun: { ...lastRun, trace: [] } });
    expect(report.nodeDetails[0].traceEligible).toBe(false);
    expect(report.neverExecuted[0].reason).toMatch(/passive/i);
  });

  it("works with no lastRun (pre-run) without throwing", () => {
    const { nodes, edges } = twoRandomGraph();
    const report = buildRunReport({ nodes, edges });
    expect(report.lastRun).toBeUndefined();
    expect(report.trace).toEqual([]);
    expect(report.backendLogs).toEqual([]);
    expect(report.neverExecuted).toHaveLength(3);

    const md = formatRunReportMarkdown(report);
    expect(md).toContain("no run has been executed");
  });
});

describe("formatRunReportMarkdown", () => {
  it("embeds the flow JSON and the generated code sections", () => {
    const { nodes, edges } = twoRandomGraph();
    const md = formatRunReportMarkdown(buildRunReport({ nodes, edges, lastRun }));

    expect(md).toContain("# LogiBoard Run Report");
    expect(md).toContain("## Flow JSON");
    expect(md).toContain('"rand_b"');
    expect(md).toContain("## Generated code (python)");
    expect(md).toContain("## Execution trace");
    expect(md).toContain("## Declared but never executed");
    expect(md).toContain("Random B");
  });

  it("includes backend and debug logs", () => {
    const { nodes, edges } = twoRandomGraph();
    const report = buildRunReport({
      nodes,
      edges,
      lastRun,
      debugLog: [{ id: 1, at: 1_700_000_000_000, level: "info", source: "exec", message: "hello" }],
    });
    const md = formatRunReportMarkdown(report);
    expect(md).toContain("INFO: graph compiled");
    expect(md).toContain("[info/exec] hello");
  });
});

describe("execution-order audit", () => {
  it("flags a consumer that ran before its producer", () => {
    // The exact shape seen in a real report: Range executed at step 1 but
    // reads Random Number, which did not run until step 4 — so Range checked
    // a value the Random node never published.
    const warnings = auditExecutionOrder(
      [
        makeNode("randomNode", "rand", "Random Number"),
        makeNode("rangeNode", "range", "Range"),
      ],
      [{ id: "e1", source: "rand", sourceHandle: "value", target: "range", targetHandle: "value" }],
      ["range", "rand"]
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Range ran at step 1/);
    expect(warnings[0]).toMatch(/Random Number/);
  });

  it("stays quiet when the producer ran first", () => {
    const warnings = auditExecutionOrder(
      [
        makeNode("randomNode", "rand", "Random Number"),
        makeNode("rangeNode", "range", "Range"),
      ],
      [{ id: "e1", source: "rand", sourceHandle: "value", target: "range", targetHandle: "value" }],
      ["rand", "range"]
    );
    expect(warnings).toHaveLength(0);
  });

  it("ignores passive producers that never appear in the trace", () => {
    const warnings = auditExecutionOrder(
      [
        makeNode("constNum", "c", "Constant Number"),
        makeNode("rangeNode", "range", "Range"),
      ],
      [{ id: "e1", source: "c", sourceHandle: "value", target: "range", targetHandle: "value" }],
      ["range"]
    );
    expect(warnings).toHaveLength(0);
  });
});
