import { describe, it, expect } from "vitest";
import { computeNodeOutputs, handleTriggerOperation, resolveConditionFlag } from "../execution-helpers";

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

describe("Range node (rangeNode)", () => {
  it("flags below when value is under min", () => {
    const out = computeNodeOutputs("rangeNode", { value: -5 }, { min: 0, max: 10 });
    expect(out.below).toBe(true);
    expect(out.above).toBe(false);
    expect(out.inRange).toBe(false);
  });

  it("flags above when value is over max", () => {
    const out = computeNodeOutputs("rangeNode", { value: 15 }, { min: 0, max: 10 });
    expect(out.above).toBe(true);
    expect(out.below).toBe(false);
    expect(out.inRange).toBe(false);
  });

  it("flags inRange when value falls between min and max", () => {
    const out = computeNodeOutputs("rangeNode", { value: 5 }, { min: 0, max: 10 });
    expect(out.inRange).toBe(true);
    expect(out.above).toBe(false);
    expect(out.below).toBe(false);
  });

  it("increments the counter on Check when in range", async () => {
    const { updatedConfig } = await handleTriggerOperation(
      "rangeNode",
      { value: 5 },
      { min: 0, max: 10, initialCount: 0, count: 3 },
      "checkTrigger"
    );
    expect(updatedConfig?.count).toBe(4);
  });

  it("decrements the counter on Check when out of range", async () => {
    const { updatedConfig } = await handleTriggerOperation(
      "rangeNode",
      { value: 15 },
      { min: 0, max: 10, initialCount: 0, count: 3 },
      "checkTrigger"
    );
    expect(updatedConfig?.count).toBe(2);
  });

  it("resets the counter to initialCount on Reset", async () => {
    const { updatedConfig } = await handleTriggerOperation(
      "rangeNode",
      { value: 5 },
      { min: 0, max: 10, initialCount: 7, count: 99 },
      "resetTrigger"
    );
    expect(updatedConfig?.count).toBe(7);
  });
});

describe("Expected Value node (assertNode)", () => {
  it("passes on equal values with numeric coercion, fails otherwise", () => {
    expect(computeNodeOutputs("assertNode", { value: 5, expected: 5 }, {}).pass).toBe(true);
    expect(computeNodeOutputs("assertNode", { value: 5, expected: "5" }, {}).pass).toBe(true);
    expect(computeNodeOutputs("assertNode", { value: true, expected: true }, {}).pass).toBe(true);
    expect(computeNodeOutputs("assertNode", { value: 5, expected: 6 }, {}).pass).toBe(false);
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

// ---------------------------------------------------------------------------
// Extended node library. Every case below is mirrored in
// backend/tests/test_passive_parity.py so the two engines cannot drift.
// ---------------------------------------------------------------------------

describe("New Input nodes", () => {
  it("clamps the slider value into its configured bounds", () => {
    expect(computeNodeOutputs("sliderInput", {}, { value: 150, min: 0, max: 100 }).value).toBe(100);
    expect(computeNodeOutputs("sliderInput", {}, { value: -5, min: 0, max: 100 }).value).toBe(0);
  });

  it("passes multiline text straight through", () => {
    expect(computeNodeOutputs("textAreaInput", {}, { value: "a\nb" }).value).toBe("a\nb");
  });

  it("emits the current time as epoch ms plus a formatted string", () => {
    const out = computeNodeOutputs("currentTimeNode", {}, {});
    expect(typeof out.epoch).toBe("number");
    expect(typeof out.formatted).toBe("string");
  });
});

describe("New Logic nodes", () => {
  it("XNOR is true only when both inputs agree", () => {
    expect(computeNodeOutputs("xnorGate", { a: true, b: true }).out).toBe(true);
    expect(computeNodeOutputs("xnorGate", { a: true, b: false }).out).toBe(false);
  });

  it("Toggle and SR Latch republish their stored state", () => {
    expect(computeNodeOutputs("toggleNode", {}, { state: true }).state).toBe(true);
    expect(computeNodeOutputs("latchNode", {}, { state: false }).state).toBe(false);
  });
});

describe("New Math & Compare nodes", () => {
  it("clamps a value into Min..Max", () => {
    expect(computeNodeOutputs("clampNode", { value: 15, min: 0, max: 10 }).out).toBe(10);
    expect(computeNodeOutputs("clampNode", { value: -3, min: 0, max: 10 }).out).toBe(0);
  });

  it("maps a value from one range onto another", () => {
    const out = computeNodeOutputs("mapRangeNode", {
      value: 512, inMin: 0, inMax: 1024, outMin: 0, outMax: 100,
    });
    expect(out.out).toBe(50);
  });

  it("collapses a zero-width source range to Out Min instead of dividing by zero", () => {
    const out = computeNodeOutputs("mapRangeNode", {
      value: 3, inMin: 5, inMax: 5, outMin: 7, outMax: 9,
    });
    expect(out.out).toBe(7);
  });

  it("interpolates between A and B by T", () => {
    expect(computeNodeOutputs("lerpNode", { a: 0, b: 10, t: 0.25 }).out).toBe(2.5);
  });

  it("tests membership of a range, honouring the inclusive flag", () => {
    expect(computeNodeOutputs("betweenNode", { value: 5, min: 0, max: 10 }).out).toBe(true);
    expect(computeNodeOutputs("betweenNode", { value: 10, min: 0, max: 10 }, { inclusive: false }).out).toBe(false);
  });

  it("rounds to N decimals, half-up like Math.round", () => {
    expect(computeNodeOutputs("roundToNode", { value: 3.14159 }, { decimals: 2 }).out).toBe(3.14);
    expect(computeNodeOutputs("roundToNode", { value: 2.5 }, { decimals: 0 }).out).toBe(3);
  });

  it("bypasses to the primary input when Enabled is false", () => {
    expect(computeNodeOutputs("clampNode", { value: 99, min: 0, max: 1, enabled: false }).out).toBe(99);
  });
});

describe("New Data & Text nodes", () => {
  it("splits text into a list and counts the parts", () => {
    const out = computeNodeOutputs("splitTextNode", { text: "a,b,c", delimiter: "," });
    expect(out.list).toEqual(["a", "b", "c"]);
    expect(out.count).toBe(3);
  });

  it("splits on whitespace runs and on lines when asked", () => {
    const words = computeNodeOutputs("splitTextNode", { text: "  the   quick\tbrown\nfox " }, { mode: "whitespace" });
    expect(words.list).toEqual(["the", "quick", "brown", "fox"]);
    expect(words.count).toBe(4);
    expect(computeNodeOutputs("splitTextNode", { text: "   " }, { mode: "whitespace" }).list).toEqual([]);
    const lines = computeNodeOutputs("splitTextNode", { text: "one\r\ntwo\nthree" }, { mode: "lines" });
    expect(lines.list).toEqual(["one", "two", "three"]);
    expect(computeNodeOutputs("splitTextNode", { text: "" }, { mode: "lines" }).list).toEqual([]);
    // Graphs saved without the config key keep the original delimiter behaviour.
    expect(computeNodeOutputs("splitTextNode", { text: "a b,c", delimiter: "," }).list).toEqual(["a b", "c"]);
  });

  it("joins a list with a delimiter", () => {
    expect(computeNodeOutputs("joinTextNode", { list: [1, 2, 3], delimiter: "-" }).out).toBe("1-2-3");
  });

  it("extracts a substring, counting negative starts from the end", () => {
    expect(computeNodeOutputs("substringNode", { text: "LogiBoard", start: 4, length: 5 }).out).toBe("Board");
    expect(computeNodeOutputs("substringNode", { text: "LogiBoard", start: -5, length: 5 }).out).toBe("Board");
  });

  it("fills template placeholders from lettered inputs in either case", () => {
    const out = computeNodeOutputs("templateNode", { a: "cat", b: 3 }, { template: "{a} has {B}" });
    expect(out.out).toBe("cat has 3");
  });

  it("parses JSON and reports validity", () => {
    const ok = computeNodeOutputs("jsonParseNode", { text: '{"x":1}' });
    expect(ok.out).toEqual({ x: 1 });
    expect(ok.valid).toBe(true);
    expect(computeNodeOutputs("jsonParseNode", { text: "nope" }).valid).toBe(false);
  });

  it("stringifies values compactly", () => {
    expect(computeNodeOutputs("jsonStringifyNode", { value: { a: 1 } }).out).toBe('{"a":1}');
  });

  it("converts between number, string and boolean", () => {
    expect(computeNodeOutputs("toNumberNode", { value: "42" }).out).toBe(42);
    expect(computeNodeOutputs("toNumberNode", { value: "abc" }).out).toBe(0);
    expect(computeNodeOutputs("toStringNode", { value: [1, 2] }).out).toBe("[1,2]");
    expect(computeNodeOutputs("toBooleanNode", { value: "false" }).out).toBe(false);
    expect(computeNodeOutputs("toBooleanNode", { value: "yes" }).out).toBe(true);
  });

  it("matches a regex and returns the first match", () => {
    const out = computeNodeOutputs("regexMatchNode", { text: "abc123", pattern: "\\d+" });
    expect(out.matched).toBe(true);
    expect(out.match).toBe("123");
  });

  it("treats an invalid regex as no match rather than throwing", () => {
    const out = computeNodeOutputs("regexMatchNode", { text: "abc", pattern: "(" });
    expect(out.matched).toBe(false);
    expect(out.match).toBe("");
  });
});

describe("Lists category", () => {
  it("reports list length", () => {
    expect(computeNodeOutputs("listLengthNode", { list: [1, 2, 3] }).length).toBe(3);
  });

  it("gets an entry by index, supporting negative indexes", () => {
    expect(computeNodeOutputs("listGetNode", { list: [1, 2, 3], index: -1 }).item).toBe(3);
    expect(computeNodeOutputs("listGetNode", { list: [1, 2, 3], index: 5 }).found).toBe(false);
  });

  it("aggregates a list of numbers", () => {
    const list = [1, 2, 3];
    expect(computeNodeOutputs("listStatsNode", { list }, { op: "sum" }).out).toBe(6);
    expect(computeNodeOutputs("listStatsNode", { list }, { op: "avg" }).out).toBe(2);
    expect(computeNodeOutputs("listStatsNode", { list }, { op: "min" }).out).toBe(1);
    expect(computeNodeOutputs("listStatsNode", { list }, { op: "max" }).out).toBe(3);
    expect(computeNodeOutputs("listStatsNode", { list }, { op: "count" }).out).toBe(3);
  });

  it("sorts numerically or lexically, in either direction", () => {
    expect(computeNodeOutputs("listSortNode", { list: [3, 1, 2] }, { numeric: true }).out).toEqual([1, 2, 3]);
    expect(
      computeNodeOutputs("listSortNode", { list: [3, 1, 2] }, { numeric: true, direction: "desc" }).out
    ).toEqual([3, 2, 1]);
    expect(computeNodeOutputs("listSortNode", { list: ["b", "a"] }, { numeric: false }).out).toEqual(["a", "b"]);
  });

  it("slices a sub-list", () => {
    expect(computeNodeOutputs("listSliceNode", { list: [1, 2, 3, 4], start: 1, end: 3 }).out).toEqual([2, 3]);
  });

  it("finds a value in a list, comparing loosely as text", () => {
    const out = computeNodeOutputs("listContainsNode", { list: [1, 2, 3], value: "2" });
    expect(out.out).toBe(true);
    expect(out.index).toBe(1);
  });

  it("ranks entries most-frequent first, breaking ties by first appearance", () => {
    // "b" and "c" both appear twice; "b" is first in the input, so it ranks first.
    const out = computeNodeOutputs("listFrequencyNode", { list: ["a", "b", "c", "b", "c", "a", "a"] });
    expect(out.values).toEqual(["a", "b", "c"]);
    expect(out.counts).toEqual([3, 2, 2]);
    expect(out.unique).toBe(3);
  });

  it("groups case-insensitively by default and case-sensitively on request", () => {
    const folded = computeNodeOutputs("listFrequencyNode", { list: ["The", "the", "THE", "cat"] });
    expect(folded.values).toEqual(["The", "cat"]);
    expect(folded.counts).toEqual([3, 1]);
    const exact = computeNodeOutputs(
      "listFrequencyNode",
      { list: ["The", "the", "THE", "cat"] },
      { caseSensitive: true }
    );
    expect(exact.counts).toEqual([1, 1, 1, 1]);
    expect(exact.unique).toBe(4);
  });

  it("drops entries below Min Count and truncates to Top N", () => {
    const list = ["a", "a", "a", "b", "b", "c"];
    expect(computeNodeOutputs("listFrequencyNode", { list }, { minCount: 2 }).values).toEqual(["a", "b"]);
    expect(computeNodeOutputs("listFrequencyNode", { list }, { topN: 1 }).values).toEqual(["a"]);
    // Unique always counts the whole input, not just the entries kept.
    expect(computeNodeOutputs("listFrequencyNode", { list }, { topN: 1 }).unique).toBe(3);
  });

  it("renders a ready-to-display report, one 'item: count' per line", () => {
    const out = computeNodeOutputs("listFrequencyNode", { list: ["red", "blue", "red"] });
    expect(out.report).toBe("red: 2\nblue: 1");
    expect(computeNodeOutputs("listFrequencyNode", { list: [] }).report).toBe("");
  });

  it("groups non-strings by the shared stringification", () => {
    const out = computeNodeOutputs("listFrequencyNode", { list: [1, "1", 2, true] });
    expect(out.values).toEqual([1, 2, true]);
    expect(out.counts).toEqual([2, 1, 1]);
  });

  it("dedupes preserving first-seen order", () => {
    const out = computeNodeOutputs("listUniqueNode", { list: ["b", "a", "B", "c", "a"] });
    expect(out.out).toEqual(["b", "a", "c"]);
    expect(out.count).toBe(3);
    expect(computeNodeOutputs("listUniqueNode", { list: ["b", "B"] }, { caseSensitive: true }).out).toEqual(["b", "B"]);
  });

  it("counts how many times one item occurs", () => {
    expect(computeNodeOutputs("listCountItemNode", { list: ["a", "B", "b"], item: "b" }).count).toBe(2);
    expect(
      computeNodeOutputs("listCountItemNode", { list: ["a", "B", "b"], item: "b" }, { caseSensitive: true }).count
    ).toBe(1);
    // Loose text comparison: a wired number matches a typed "2".
    expect(computeNodeOutputs("listCountItemNode", { list: [1, 2, 2], item: "2" }).count).toBe(2);
    expect(computeNodeOutputs("listCountItemNode", { list: ["a"], item: "z" }).count).toBe(0);
  });

  it("republishes the accumulated append buffer", () => {
    const out = computeNodeOutputs("listAppendNode", {}, { items: [1, 2] });
    expect(out.list).toEqual([1, 2]);
    expect(out.length).toBe(2);
  });
});

describe("New Output nodes", () => {
  it("republishes the accumulated value list", () => {
    const out = computeNodeOutputs("valueListNode", {}, { values: ["a", "b"] });
    expect(out.list).toEqual(["a", "b"]);
    expect(out.length).toBe(2);
  });

  it("renders a gauge reading as a clamped percentage", () => {
    expect(computeNodeOutputs("gaugeNode", { value: 25 }, { min: 0, max: 50 }).percent).toBe(50);
    expect(computeNodeOutputs("gaugeNode", { value: 999 }, { min: 0, max: 50 }).percent).toBe(100);
  });
});

describe("Extended trigger-driven nodes", () => {
  it("Toggle flips its state and Reset clears it", async () => {
    const flip = await handleTriggerOperation("toggleNode", {}, { state: false }, "inTrigger");
    expect(flip.updatedConfig?.state).toBe(true);
    const reset = await handleTriggerOperation("toggleNode", {}, { state: true }, "resetTrigger");
    expect(reset.updatedConfig?.state).toBe(false);
  });

  it("SR Latch holds true on Set and false on Reset", async () => {
    expect((await handleTriggerOperation("latchNode", {}, {}, "setTrigger")).updatedConfig?.state).toBe(true);
    expect((await handleTriggerOperation("latchNode", {}, {}, "resetTrigger")).updatedConfig?.state).toBe(false);
  });

  it("List Append pushes the current value and Reset empties the buffer", async () => {
    const appended = await handleTriggerOperation("listAppendNode", { value: 7 }, { items: [1] }, "inTrigger");
    expect(appended.updatedConfig?.items).toEqual([1, 7]);
    const cleared = await handleTriggerOperation("listAppendNode", { value: 7 }, { items: [1] }, "resetTrigger");
    expect(cleared.updatedConfig?.items).toEqual([]);
  });

  it("Gate passes the trigger only while Open is true", async () => {
    expect((await handleTriggerOperation("gateNode", { open: true }, {}, "inTrigger")).nextTriggerPort).toBe("outTrigger");
    expect((await handleTriggerOperation("gateNode", { open: false }, {}, "inTrigger")).nextTriggerPort).toBe(null);
  });

  it("Once fires a single time until Reset re-arms it", async () => {
    const first = await handleTriggerOperation("onceNode", {}, { fired: false }, "inTrigger");
    expect(first.nextTriggerPort).toBe("outTrigger");
    expect(first.updatedConfig?.fired).toBe(true);
    expect((await handleTriggerOperation("onceNode", {}, { fired: true }, "inTrigger")).nextTriggerPort).toBe(null);
    expect((await handleTriggerOperation("onceNode", {}, { fired: true }, "resetTrigger")).updatedConfig?.fired).toBe(false);
  });

  it("Sequence cycles through its three outputs", async () => {
    for (const [step, port] of [[0, "out1"], [1, "out2"], [2, "out3"]] as const) {
      const res = await handleTriggerOperation("sequenceNode", {}, { step }, "inTrigger");
      expect(res.nextTriggerPort).toBe(port);
    }
    // The third fire wraps the counter back round to the first output.
    expect((await handleTriggerOperation("sequenceNode", {}, { step: 2 }, "inTrigger")).updatedConfig?.step).toBe(0);
  });

  it("Value List appends each triggered value as a new entry", async () => {
    const res = await handleTriggerOperation("valueListNode", { value: "b" }, { values: ["a"] }, "inTrigger");
    expect(res.updatedConfig?.values).toEqual(["a", "b"]);
    expect(res.nextTriggerPort).toBe("outTrigger");
  });
});
