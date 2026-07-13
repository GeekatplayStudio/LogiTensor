import { describe, it, expect } from "vitest";
import { computeNodeOutputs, resolveConditionFlag } from "../execution-helpers";

describe("Formula node (mathNode)", () => {
  it("computes arithmetic over lettered inputs", () => {
    const out = computeNodeOutputs("mathNode", { a: 2, b: 3, c: 4 }, { expression: "a + b * c" });
    expect(out.out).toBe(14);
  });

  it("coerces numeric-looking strings to numbers", () => {
    const out = computeNodeOutputs("mathNode", { a: "5", b: "2.5" }, { expression: "a + b" });
    expect(out.out).toBe(7.5);
  });

  it("concatenates when inputs are real strings", () => {
    const out = computeNodeOutputs(
      "mathNode",
      { a: 5, b: 5, c: "volts" },
      { expression: '(a + b) + " " + c' }
    );
    expect(out.out).toBe("10 volts");
  });

  it("supports logical/comparison expressions", () => {
    const out = computeNodeOutputs("mathNode", { a: 10, b: 3 }, { expression: "a > b && b > 0" });
    expect(out.out).toBe(true);
  });

  it("accepts uppercase letters matching the node's displayed port labels", () => {
    // Ports are named a/b but the node displays them as A/B — typing the
    // formula using the displayed labels must work identically.
    const out = computeNodeOutputs("mathNode", { a: 5, b: 1 }, { expression: "A+B" });
    expect(out.out).toBe(6);
  });

  it("treats mixed-case identifiers the same as lowercase", () => {
    const out = computeNodeOutputs("mathNode", { a: 2, b: 3, c: 4 }, { expression: "A + b * C" });
    expect(out.out).toBe(14);
  });
});

describe("Safe Expression node (expressionNode)", () => {
  it("accepts uppercase letters matching the node's displayed X/Y labels", () => {
    const out = computeNodeOutputs("expressionNode", { x: 3, y: 4 }, { expression: "X * 2 + Y" });
    expect(out.out).toBe(10);
  });
});

describe("Math Function node", () => {
  it("applies unary and binary functions", () => {
    expect(computeNodeOutputs("mathFunctionNode", { a: -7 }, { op: "abs" }).out).toBe(7);
    expect(computeNodeOutputs("mathFunctionNode", { a: 2, b: 10 }, { op: "pow" }).out).toBe(1024);
    expect(computeNodeOutputs("mathFunctionNode", { a: 3, b: 9 }, { op: "min" }).out).toBe(3);
    expect(computeNodeOutputs("mathFunctionNode", { a: 10, b: 3 }, { op: "mod" }).out).toBe(1);
    expect(computeNodeOutputs("mathFunctionNode", { a: 10, b: 0 }, { op: "mod" }).out).toBe(0);
  });
});

describe("Filter node", () => {
  it("passes value through in include mode when search matches", () => {
    const out = computeNodeOutputs(
      "filterNode",
      { value: "Hello World", search: "world" },
      { mode: "include", caseSensitive: false }
    );
    expect(out.match).toBe(true);
    expect(out.out).toBe("Hello World");
  });

  it("blocks value in include mode when search misses", () => {
    const out = computeNodeOutputs(
      "filterNode",
      { value: "Hello World", search: "mars" },
      { mode: "include" }
    );
    expect(out.match).toBe(false);
    expect(out.out).toBe(null);
  });

  it("inverts behavior in exclude mode", () => {
    const out = computeNodeOutputs(
      "filterNode",
      { value: "Hello World", search: "mars" },
      { mode: "exclude" }
    );
    expect(out.match).toBe(true);
    expect(out.out).toBe("Hello World");
  });

  it("honors case sensitivity", () => {
    const out = computeNodeOutputs(
      "filterNode",
      { value: "Hello World", search: "world" },
      { mode: "include", caseSensitive: true }
    );
    expect(out.match).toBe(false);
  });
});

describe("Text nodes", () => {
  it("transforms text", () => {
    expect(computeNodeOutputs("stringOpNode", { text: "hey" }, { op: "uppercase" }).out).toBe("HEY");
    expect(computeNodeOutputs("stringOpNode", { text: "  hey  " }, { op: "trim" }).out).toBe("hey");
    expect(computeNodeOutputs("stringOpNode", { text: "abc" }, { op: "length" }).out).toBe(3);
    expect(computeNodeOutputs("stringOpNode", { text: "abc" }, { op: "reverse" }).out).toBe("cba");
  });

  it("replaces every occurrence", () => {
    const out = computeNodeOutputs("replaceTextNode", { text: "a-b-c", find: "-", replace: "+" }, {});
    expect(out.out).toBe("a+b+c");
  });
});

describe("Loop nodes (passive outputs)", () => {
  it("exposes the current index/iteration from config", () => {
    expect(computeNodeOutputs("forLoopNode", {}, { index: 4 }).index).toBe(4);
    expect(computeNodeOutputs("whileLoopNode", {}, { iteration: 7 }).iteration).toBe(7);
  });
});

describe("resolveConditionFlag", () => {
  it("handles booleans, truthy strings, and expressions", () => {
    expect(resolveConditionFlag(true)).toBe(true);
    expect(resolveConditionFlag("yes")).toBe(true);
    expect(resolveConditionFlag("0")).toBe(false);
    expect(resolveConditionFlag("")).toBe(false);
    expect(resolveConditionFlag("3 > 2")).toBe(true);
    expect(resolveConditionFlag("1 == 2")).toBe(false);
  });
});
