import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "@/types/nodes";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { generateCode, CODE_TARGETS } from "../codegen";

// Builds a canvas-shaped node from the real definitions so tests exercise the
// same port ids/config defaults the app uses.
function makeNode(type: string, id: string, config?: Record<string, unknown>): Node<NodeData> {
  const def = NODE_DEFINITIONS[type];
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label: def.label,
      type,
      inputs: def.inputs.map((i) => ({ ...i })),
      outputs: def.outputs.map((o) => ({ ...o })),
      config: { ...(def.config ?? {}), ...(config ?? {}) },
    },
  };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return { id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle };
}

describe("generateCode", () => {
  it("emits a terminal print for a pure data graph in JS and Python", () => {
    const nodes = [makeNode("constNum", "n1", { value: 4 }), makeNode("mathFunctionNode", "f1", { op: "sqrt" })];
    const edges = [edge("n1", "value", "f1", "a")];
    const js = generateCode(nodes, edges, "javascript");
    expect(js.code).toContain("Math.sqrt(Number(4))");
    expect(js.code).toContain("console.log");
    const py = generateCode(nodes, edges, "python");
    expect(py.code).toContain("math.sqrt(float(4))");
    expect(py.code).toContain("print(");
  });

  it("threads expressions through logic gates with language-correct operators", () => {
    const nodes = [
      makeNode("constBool", "b1", { value: true }),
      makeNode("constBool", "b2", { value: false }),
      makeNode("andGate", "g1"),
    ];
    const edges = [edge("b1", "value", "g1", "a"), edge("b2", "value", "g1", "b")];
    expect(generateCode(nodes, edges, "javascript").code).toContain("(true && false)");
    expect(generateCode(nodes, edges, "python").code).toContain("(True and False)");
  });

  it("compiles a trigger chain: manual trigger -> if/else -> logger", () => {
    const nodes = [
      makeNode("triggerInput", "t1"),
      makeNode("ifElseTrigger", "if1"),
      makeNode("loggerNode", "log1"),
      makeNode("constBool", "b1", { value: true }),
    ];
    const edges = [
      edge("t1", "triggerOut", "if1", "inTrigger"),
      edge("b1", "value", "if1", "condition"),
      edge("if1", "onTrue", "log1", "inTrigger"),
    ];
    const py = generateCode(nodes, edges, "python");
    expect(py.code).toContain("def run_trigger_1():");
    expect(py.code).toContain("if true:".replace("true", "True"));
    expect(py.code).toContain("print(");
    const js = generateCode(nodes, edges, "javascript");
    expect(js.code).toContain("if (true) {");
  });

  it("gives stateful nodes declared variables mutated by their triggers", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("counterNode", "c1", { count: 0 })];
    const edges = [edge("t1", "triggerOut", "c1", "incTrigger")];
    const js = generateCode(nodes, edges, "javascript");
    expect(js.code).toContain("let counter_1_count = 0;");
    expect(js.code).toContain("counter_1_count = counter_1_count + 1;");
  });

  it("substitutes formula letters in either case (the A+B regression)", () => {
    const nodes = [
      makeNode("constNum", "n1", { value: 2 }),
      makeNode("constNum", "n2", { value: 3 }),
      makeNode("mathNode", "m1", { expression: "A + B" }),
    ];
    const edges = [edge("n1", "value", "m1", "a"), edge("n2", "value", "m1", "b")];
    expect(generateCode(nodes, edges, "javascript").code).toContain("(2 + 3)");
  });

  it("cuts trigger loops with a marker instead of recursing forever", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("delayNode", "d1")];
    const edges = [
      edge("t1", "triggerOut", "d1", "inTrigger"),
      edge("d1", "outTrigger", "d1", "inTrigger"), // self-loop
    ];
    const js = generateCode(nodes, edges, "javascript");
    expect(js.code).toContain("trigger loop");
  });

  it("produces output for every registered target without throwing", () => {
    const nodes = [
      makeNode("triggerInput", "t1"),
      makeNode("constNum", "n1", { value: 7 }),
      makeNode("loggerNode", "log1"),
    ];
    const edges = [
      edge("t1", "triggerOut", "log1", "inTrigger"),
      edge("n1", "value", "log1", "value"),
    ];
    for (const target of CODE_TARGETS) {
      const res = generateCode(nodes, edges, target.id);
      expect(res.code.length, target.id).toBeGreaterThan(0);
    }
  });

  it("derived C target keeps structure and bails honestly on JS-only idioms", () => {
    const nodes = [
      makeNode("triggerInput", "t1"),
      makeNode("stringOpNode", "s1", { op: "reverse" }),
      makeNode("loggerNode", "log1"),
    ];
    const edges = [
      edge("t1", "triggerOut", "log1", "inTrigger"),
      edge("s1", "out", "log1", "value"),
    ];
    const c = generateCode(nodes, edges, "c");
    expect(c.code).toContain("#include <stdio.h>");
    expect(c.code).toContain("int main()");
    expect(c.code).toContain("TODO(port to C by hand)"); // [...].reverse().join("")
  });
});
