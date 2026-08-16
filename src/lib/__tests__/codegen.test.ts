import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "@/types/nodes";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { generateCode, CODE_TARGETS, linesForNode, nodeAtLine } from "../codegen";

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
    // The function's result is bound to a name, and the print reads the name —
    // a single-consumer constant stays inlined into that assignment.
    const js = generateCode(nodes, edges, "javascript");
    expect(js.code).toContain("let mathfunction_1_out = Math.sqrt(Number(4));");
    expect(js.code).toContain("console.log(\"Math Function.Result =\", mathfunction_1_out);");
    const py = generateCode(nodes, edges, "python");
    expect(py.code).toContain("mathfunction_1_out = math.sqrt(float(4))");
    expect(py.code).toContain('print("Math Function.Result =", mathfunction_1_out)');
  });

  it("threads expressions through logic gates with language-correct operators", () => {
    const nodes = [
      makeNode("constBool", "b1", { value: true }),
      makeNode("constBool", "b2", { value: false }),
      makeNode("andGate", "g1"),
    ];
    const edges = [edge("b1", "value", "g1", "a"), edge("b2", "value", "g1", "b")];
    expect(generateCode(nodes, edges, "javascript").code).toContain("let and_1_out = (true && false);");
    expect(generateCode(nodes, edges, "python").code).toContain("and_1_out = (True and False)");
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
    expect(generateCode(nodes, edges, "javascript").code).toContain("let math_1_out = (2 + 3);");
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

  it("emits nodes that no trigger chain reaches (regression: whole graph vanished)", () => {
    // A Constant -> Logger graph has no Manual Trigger, and Logger's only
    // output is a trigger, so it produced literally "empty graph" before.
    const nodes = [makeNode("constNum", "n1", { value: 42 }), makeNode("loggerNode", "log1")];
    const edges = [edge("n1", "value", "log1", "value")];
    const py = generateCode(nodes, edges, "python");
    expect(py.code).toContain("print(42)");
    expect(py.code).toContain("not reached by any trigger");
    expect(py.code).not.toContain("empty graph");
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

describe("named intermediate variables", () => {
  // The reported graph: two Random Numbers -> Math Function (abs) -> Text
  // Output. It used to compile to a single `print(abs(...))` with no line
  // belonging to the Math Function at all — "where is the Math Function?".
  const nodes = [
    makeNode("randomNode", "r1"),
    makeNode("randomNode", "r2"),
    makeNode("mathFunctionNode", "f1", { op: "abs" }),
    makeNode("textOutputNode", "o1"),
  ];
  const edges = [
    edge("r1", "value", "f1", "a"),
    edge("r2", "value", "f1", "b"),
    edge("f1", "out", "o1", "value"),
  ];

  it("gives every node in the flow at least one attributable line", () => {
    for (const language of ["javascript", "python"] as const) {
      const res = generateCode(nodes, edges, language);
      for (const id of ["r1", "r2", "f1", "o1"]) {
        expect(linesForNode(res, id).length, `${id} (${language})`).toBeGreaterThan(0);
      }
    }
  });

  it("names the Math Function's result and prints it by name", () => {
    const py = generateCode(nodes, edges, "python").code;
    expect(py).toContain("# Math Function (abs)");
    expect(py).toContain("mathfunction_1_out = abs(float(random_1_value))");
    expect(py).toContain("print(mathfunction_1_out)");
    const js = generateCode(nodes, edges, "javascript").code;
    expect(js).toContain("// Math Function (abs)");
    expect(js).toContain("let mathfunction_1_out = Math.abs(Number(random_1_value));");
    expect(js).toContain("console.log(mathfunction_1_out);");
  });

  it("assigns a producer above the consumer that reads it", () => {
    const res = generateCode(nodes, edges, "python");
    const lineOf = (needle: string) => res.lines.findIndex((l) => l.text.includes(needle));
    const producer = lineOf("random_1_value = random.randint");
    const consumer = lineOf("mathfunction_1_out = abs");
    const printed = lineOf("print(mathfunction_1_out)");
    expect(producer).toBeGreaterThan(-1);
    expect(producer).toBeLessThan(consumer);
    expect(consumer).toBeLessThan(printed);
  });

  it("emits a shared producer once and references it twice", () => {
    // One Random feeding both Math Function inputs. Inlining used to draw the
    // random number twice, so A and B disagreed — a correctness bug, not just
    // a readability one.
    const shared = [makeNode("randomNode", "r1"), makeNode("mathFunctionNode", "f1", { op: "min" })];
    const sharedEdges = [edge("r1", "value", "f1", "a"), edge("r1", "value", "f1", "b")];
    const py = generateCode(shared, sharedEdges, "python").code;
    expect(py.split("random.randint").length - 1).toBe(1);
    expect(py).toContain("min(float(random_1_value), float(random_1_value))");
    const js = generateCode(shared, sharedEdges, "javascript").code;
    expect(js.split("Math.random(").length - 1).toBe(1);
  });

  it("keeps a single-use constant inlined but names a shared one", () => {
    // Rule: constants are as readable inlined as behind a name — unless two
    // consumers read them, where the name documents that it is one value.
    const solo = [makeNode("constNum", "n1", { value: 5 }), makeNode("notGate", "g1")];
    expect(generateCode(solo, [edge("n1", "value", "g1", "a")], "javascript").code).toContain("let not_1_out = !(5);");

    const two = [makeNode("constNum", "n1", { value: 5 }), makeNode("notGate", "g1"), makeNode("notGate", "g2")];
    const js = generateCode(two, [edge("n1", "value", "g1", "a"), edge("n1", "value", "g2", "a")], "javascript").code;
    expect(js).toContain("let constnum_1_value = 5;");
    expect(js).toContain("let not_1_out = !(constnum_1_value);");
    expect(js).toContain("let not_2_out = !(constnum_1_value);");
  });

  it("keeps a while condition inline so the loop can still terminate", () => {
    // Hoisting the condition into a variable above the loop would freeze it.
    const loop = [
      makeNode("triggerInput", "t1"),
      makeNode("whileLoopNode", "w1"),
      makeNode("counterNode", "c1"),
      makeNode("compareNode", "cmp1", { op: "<" }),
    ];
    const loopEdges = [
      edge("t1", "triggerOut", "w1", "inTrigger"),
      edge("c1", "count", "cmp1", "a"),
      edge("cmp1", "out", "w1", "condition"),
    ];
    const js = generateCode(loop, loopEdges, "javascript").code;
    expect(js).toContain("while (((Number(counter_1_count) < Number(0))");
    expect(js).not.toContain("let compare_1_out =");
  });
});

describe("source mapping", () => {
  // Manual Trigger -> Logger, with a constant feeding the logged value.
  const nodes = [
    makeNode("triggerInput", "t1"),
    makeNode("loggerNode", "log1"),
    makeNode("constNum", "n1", { value: 7 }),
  ];
  const edges = [edge("t1", "triggerOut", "log1", "inTrigger"), edge("n1", "value", "log1", "value")];

  it("attributes the print line to the logger, not the trigger that fired it", () => {
    for (const [language, call] of [["javascript", "console.log("], ["python", "print("]] as const) {
      const res = generateCode(nodes, edges, language);
      const printed = res.lines.filter((l) => l.text.includes(call));
      expect(printed.length, language).toBeGreaterThan(0);
      for (const line of printed) expect(line.nodeId, `${language}: ${line.text}`).toBe("log1");
    }
  });

  it("round-trips linesForNode and nodeAtLine over a multi-node graph", () => {
    const res = generateCode(nodes, edges, "javascript");
    const loggerLines = linesForNode(res, "log1");
    expect(loggerLines.length).toBeGreaterThan(0);
    for (const i of loggerLines) expect(nodeAtLine(res, i)).toBe("log1");
    // The logger's console.log is one of them; the trigger owns its own def line.
    expect(loggerLines.some((i) => res.lines[i].text.includes("console.log("))).toBe(true);
    const triggerLines = linesForNode(res, "t1");
    expect(triggerLines.some((i) => res.lines[i].text.includes("function run_trigger_1()"))).toBe(true);
    // Disjoint sets, and imports/helpers belong to no node.
    expect(triggerLines.filter((i) => loggerLines.includes(i))).toEqual([]);
    expect(nodeAtLine(res, 0)).toBeUndefined();
    expect(nodeAtLine(res, res.lines.length + 10)).toBeUndefined();
    expect(linesForNode(res, "nope")).toEqual([]);
  });

  it("keeps attribution through the C adapter's filtering and headers", () => {
    const res = generateCode(nodes, edges, "c");
    const printed = res.lines.filter((l) => l.text.includes("print_value("));
    expect(printed.length).toBeGreaterThan(0);
    // Terminal prints for unconsumed outputs belong to their own node, so
    // assert the logger owns at least one and none is mis-tagged to t1.
    expect(printed.some((l) => l.nodeId === "log1")).toBe(true);
    expect(printed.some((l) => l.nodeId === "t1")).toBe(false);
    // Header lines are shared scaffolding, not any node's code.
    expect(nodeAtLine(res, 0)).toBeUndefined();
  });

  it("never lets the line map drift from the emitted text", () => {
    for (const target of CODE_TARGETS) {
      const res = generateCode(nodes, edges, target.id);
      expect(res.lines.map((l) => l.text).join("\n") + "\n", target.id).toBe(res.code);
    }
  });
});

describe("extended node library emitters", () => {
  it("emits Round To with JS Math.round semantics in both languages", () => {
    // floor(x * f + 0.5) / f — never the language's own round(), which is
    // half-to-even in Python (the trap this asserts against).
    const nodes = [makeNode("constNum", "n1", { value: 2.345 }), makeNode("roundToNode", "r1", { decimals: 2 })];
    const edges = [edge("n1", "value", "r1", "value")];
    expect(generateCode(nodes, edges, "javascript").code).toContain("(Math.floor(Number(2.345) * 100 + 0.5) / 100)");
    const py = generateCode(nodes, edges, "python").code;
    expect(py).toContain("(math.floor(float(2.345) * 100 + 0.5) / 100)");
    expect(py).not.toContain("round(");
  });

  it("fills text templates from lettered inputs in either case", () => {
    const nodes = [makeNode("constString", "s1", { value: "world" }), makeNode("templateNode", "t1", { template: "hi {A} {b}" })];
    const edges = [edge("s1", "value", "t1", "a")];
    const js = generateCode(nodes, edges, "javascript").code;
    expect(js).toContain("function lb_to_str(v) {");
    expect(js).toContain('.split("{A}").join(lb_to_str("world"))');
    const py = generateCode(nodes, edges, "python").code;
    expect(py).toContain("def lb_to_str(v):");
    expect(py).toContain('.replace("{A}", lb_to_str("world"))');
  });

  it("emits list stats through a shared, deduped helper", () => {
    const nodes = [makeNode("listStatsNode", "l1", { op: "avg" }), makeNode("listStatsNode", "l2", { op: "avg" })];
    const js = generateCode(nodes, [], "javascript").code;
    expect(js).toContain('lb_list_stats([], "avg")');
    // whole-block dedup: two identical nodes must not emit the helper twice
    expect(js.split("function lb_list_stats(").length - 1).toBe(1);
    const py = generateCode(nodes, [], "python").code;
    expect(py).toContain('lb_list_stats([], "avg")');
    expect(py).toContain("def lb_list_stats(items, op):");
  });

  it("compiles a stateful Toggle into a flipped state variable", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("toggleNode", "tg1")];
    const edges = [edge("t1", "triggerOut", "tg1", "inTrigger")];
    const js = generateCode(nodes, edges, "javascript").code;
    expect(js).toContain("let toggle_1_state = false;");
    expect(js).toContain("toggle_1_state = !(toggle_1_state);");
    const py = generateCode(nodes, edges, "python").code;
    expect(py).toContain("toggle_1_state = False");
    expect(py).toContain("toggle_1_state = (not (toggle_1_state))");
  });

  it("compiles List Append into a real push on a list variable", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("listAppendNode", "a1"), makeNode("constNum", "n1", { value: 7 })];
    const edges = [edge("t1", "triggerOut", "a1", "inTrigger"), edge("n1", "value", "a1", "value")];
    expect(generateCode(nodes, edges, "javascript").code).toContain("listappend_1_items.push(7);");
    expect(generateCode(nodes, edges, "python").code).toContain("listappend_1_items.append(7)");
  });

  it("compiles the Gate control node into a guarded chain", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("gateNode", "g1"), makeNode("loggerNode", "log1")];
    const edges = [edge("t1", "triggerOut", "g1", "inTrigger"), edge("g1", "outTrigger", "log1", "inTrigger")];
    const js = generateCode(nodes, edges, "javascript").code;
    expect(js).toContain("if (lb_to_bool(true)) {");
    expect(js).toContain("console.log(");
    const py = generateCode(nodes, edges, "python").code;
    expect(py).toContain("if lb_to_bool(True):");
    expect(py).toContain("print(");
  });

  it("cycles the Sequence node's outputs and advances its step", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("sequenceNode", "s1"), makeNode("loggerNode", "log1")];
    const edges = [edge("t1", "triggerOut", "s1", "inTrigger"), edge("s1", "out2", "log1", "inTrigger")];
    const js = generateCode(nodes, edges, "javascript").code;
    expect(js).toContain("if (sequence_1_step % 3 == 1) {");
    expect(js).toContain("sequence_1_step = (sequence_1_step + 1) % 3;");
  });

  it("emits the frequency/unique/count-item list nodes with their runtime helpers", () => {
    const nodes = [
      makeNode("listFrequencyNode", "f1", { topN: 3 }),
      makeNode("listUniqueNode", "u1"),
      makeNode("listCountItemNode", "c1"),
      makeNode("loggerNode", "log1"),
    ];
    const edges = [edge("f1", "report", "log1", "value")];
    for (const language of ["javascript", "python"] as const) {
      const res = generateCode(nodes, edges, language);
      expect(res.warnings.filter((w) => w.includes("No emitter"))).toEqual([]);
      expect(res.code).toContain("lb_list_frequency");
      expect(res.code).toContain("lb_list_unique");
      expect(res.code).toContain("lb_list_count_item");
      // report is slot 2 of the helper's [values, counts, report, unique].
      expect(res.code).toContain("[2]");
    }
  });

  it("emits Split Text's whitespace mode as the third lb_split argument", () => {
    const nodes = [makeNode("splitTextNode", "s1", { mode: "whitespace" }), makeNode("loggerNode", "log1")];
    const edges = [edge("s1", "list", "log1", "value")];
    expect(generateCode(nodes, edges, "javascript").code).toContain('"whitespace"');
    expect(generateCode(nodes, edges, "python").code).toContain('"whitespace"');
  });

  it("has an emitter for every registered node type (coverage guard)", () => {
    // Guards the gap this suite closed: a new node type added to
    // NODE_DEFINITIONS without a codegen emitter fails here rather than
    // silently emitting null in the code panel.
    for (const type of Object.keys(NODE_DEFINITIONS)) {
      const nodes = [makeNode(type, "solo")];
      for (const language of ["javascript", "python"]) {
        const res = generateCode(nodes, [], language);
        const missing = res.warnings.filter((w) => w.includes("No emitter"));
        expect(missing, `${type} (${language})`).toEqual([]);
        expect(res.code, `${type} (${language})`).not.toContain("has no code mapping");
      }
    }
  });
});
