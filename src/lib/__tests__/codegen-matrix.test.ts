import { describe, it, expect } from "vitest";
import { materializeNlGraph } from "../nl-apply";
import { generateCode, CODE_TARGETS } from "../codegen";

// Generator matrix: a simple and a complex flow, generated for EVERY target
// language, checking each emission is present, structurally sane, and keeps
// its per-line node mapping. Native + near-native targets must be fully
// clean (no TODO bailouts); C-family/Go/Rust/Ruby/PHP may bail on JS idioms
// but must say so honestly rather than emit broken code silently.

const simpleSpec = {
  nodes: [
    { id: "n1", type: "constNum", config: { value: 2 } },
    { id: "n2", type: "constNum", config: { value: 40 } },
    { id: "n3", type: "mathNode", config: { expression: "a + b" } },
  ],
  edges: [
    { source: "n1", sourceHandle: "value", target: "n3", targetHandle: "a" },
    { source: "n2", sourceHandle: "value", target: "n3", targetHandle: "b" },
  ],
};

// trigger chain + branch + loop + counter + strings + list — one of each of
// the construct families the emitters have to handle.
const complexSpec = {
  nodes: [
    { id: "t", type: "triggerInput", config: {} },
    { id: "num", type: "constNum", config: { value: 7 } },
    { id: "cmp", type: "compareNode", config: { op: ">" }, inputs: { b: 5 } },
    { id: "branch", type: "ifElseTrigger", config: {} },
    { id: "loop", type: "forLoopNode", config: {}, inputs: { count: 3 } },
    { id: "counter", type: "counterNode", config: {} },
    { id: "txt", type: "constString", config: { value: "hello board" } },
    { id: "up", type: "stringOpNode", config: { op: "uppercase" } },
    { id: "split", type: "splitTextNode", inputs: { delimiter: " " } },
    { id: "log", type: "loggerNode", config: {} },
  ],
  edges: [
    { source: "num", sourceHandle: "value", target: "cmp", targetHandle: "a" },
    { source: "cmp", sourceHandle: "out", target: "branch", targetHandle: "condition" },
    { source: "t", sourceHandle: "triggerOut", target: "branch", targetHandle: "inTrigger" },
    { source: "branch", sourceHandle: "onTrue", target: "loop", targetHandle: "inTrigger" },
    { source: "loop", sourceHandle: "loopBody", target: "counter", targetHandle: "incTrigger" },
    { source: "txt", sourceHandle: "value", target: "up", targetHandle: "text" },
    { source: "txt", sourceHandle: "value", target: "split", targetHandle: "text" },
    { source: "up", sourceHandle: "out", target: "log", targetHandle: "value" },
    { source: "loop", sourceHandle: "done", target: "log", targetHandle: "inTrigger" },
  ],
};

const ALL_TARGET_IDS = CODE_TARGETS.map((t) => t.id);
// these emissions must be runnable as-is — zero TODO bailouts allowed
const CLEAN_TARGETS = new Set(["typescript", "javascript", "python", "micropython"]);

describe("codegen matrix", () => {
  it("supports the full advertised target list", () => {
    expect(ALL_TARGET_IDS).toEqual([
      "typescript",
      "javascript",
      "python",
      "c",
      "cpp",
      "go",
      "rust",
      "ruby",
      "php",
      "micropython",
    ]);
  });

  for (const [name, spec] of [
    ["simple", simpleSpec],
    ["complex", complexSpec],
  ] as const) {
    describe(`${name} flow`, () => {
      const { nodes, edges, problems } = materializeNlGraph(spec, name);

      it("materializes without problems", () => {
        expect(problems).toEqual([]);
        expect(nodes.length).toBe(spec.nodes.length);
      });

      for (const target of ALL_TARGET_IDS) {
        it(`${target}: emits code with per-node line mapping`, () => {
          const res = generateCode(nodes, edges, target);
          expect(res.code.length).toBeGreaterThan(40);
          expect(res.warnings).toEqual([]);
          // every statement-emitting node must contribute a mapped line
          // (pure constants are inlined into their consumers by design)
          const mapped = new Set(res.lines.map((l) => l.nodeId).filter(Boolean));
          expect(mapped.size).toBeGreaterThan(0);
          for (const n of nodes) {
            const hasTrigger =
              n.data.inputs.some((p) => p.type === "trigger") ||
              n.data.outputs.some((p) => p.type === "trigger");
            if (hasTrigger) expect(mapped, `${target}: ${n.data.label} unmapped`).toContain(n.id);
          }
          if (CLEAN_TARGETS.has(target)) {
            expect(res.code, `${target} must have no TODO bailouts`).not.toContain("TODO(");
          }
        });
      }
    });
  }

  it("micropython swaps in sleep_ms and keeps Python syntax", () => {
    const { nodes, edges } = materializeNlGraph(
      {
        nodes: [
          { id: "t", type: "triggerInput", config: {} },
          { id: "d", type: "delayNode", config: {}, inputs: { delayMs: 250 } },
          { id: "log", type: "loggerNode", config: {}, inputs: { value: "tick" } },
        ],
        edges: [
          { source: "t", sourceHandle: "triggerOut", target: "d", targetHandle: "inTrigger" },
          { source: "d", sourceHandle: "outTrigger", target: "log", targetHandle: "inTrigger" },
        ],
      },
      "mp"
    );
    const res = generateCode(nodes, edges, "micropython");
    expect(res.code).toContain("time.sleep_ms(");
    expect(res.code).not.toContain("time.sleep((");
    expect(res.code).toContain("MicroPython build");
  });

  it("ruby closes blocks with end and has no stray braces", () => {
    const { nodes, edges } = materializeNlGraph(complexSpec, "rb");
    const res = generateCode(nodes, edges, "ruby");
    expect(res.code).toContain("def main_flow");
    expect(res.code).toContain("end");
    // no un-adapted JS block braces may survive outside TODO comments
    for (const line of res.lines) {
      if (line.text.includes("TODO(")) continue;
      expect(line.text.trim(), `stray brace in: ${line.text}`).not.toMatch(/^[{}]$|\{$/);
    }
  });
});
