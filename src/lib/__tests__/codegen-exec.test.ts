import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { materializeNlGraph } from "../nl-apply";
import { generateCode } from "../codegen";

// The strongest generator check there is: actually RUN the generated program
// with data fed in and assert it produces the same result the node engine
// does. JavaScript runs in-process (new Function with a captured console);
// Python runs through the real interpreter.

// 7 > 5 -> If branch -> loop 3x -> counter, then Done -> log the uppercased
// text. Correct execution must print HELLO BOARD (and never the Else path).
const flowSpec = {
  nodes: [
    { id: "t", type: "triggerInput", config: {} },
    { id: "num", type: "constNum", config: { value: 7 } },
    { id: "cmp", type: "compareNode", config: { op: ">" }, inputs: { b: 5 } },
    { id: "branch", type: "ifElseTrigger", config: {} },
    { id: "loop", type: "forLoopNode", config: {}, inputs: { count: 3 } },
    { id: "counter", type: "counterNode", config: {} },
    { id: "txt", type: "constString", config: { value: "hello board" } },
    { id: "up", type: "stringOpNode", config: { op: "uppercase" } },
    { id: "log", type: "loggerNode", config: {} },
    { id: "elseLog", type: "loggerNode", config: {}, inputs: { value: "WRONG BRANCH" } },
  ],
  edges: [
    { source: "num", sourceHandle: "value", target: "cmp", targetHandle: "a" },
    { source: "cmp", sourceHandle: "out", target: "branch", targetHandle: "condition" },
    { source: "t", sourceHandle: "triggerOut", target: "branch", targetHandle: "inTrigger" },
    { source: "branch", sourceHandle: "onTrue", target: "loop", targetHandle: "inTrigger" },
    { source: "branch", sourceHandle: "onFalse", target: "elseLog", targetHandle: "inTrigger" },
    { source: "loop", sourceHandle: "loopBody", target: "counter", targetHandle: "incTrigger" },
    { source: "txt", sourceHandle: "value", target: "up", targetHandle: "text" },
    { source: "up", sourceHandle: "out", target: "log", targetHandle: "value" },
    { source: "loop", sourceHandle: "done", target: "log", targetHandle: "inTrigger" },
  ],
};

function build() {
  const { nodes, edges, problems } = materializeNlGraph(flowSpec, "x");
  expect(problems).toEqual([]);
  return { nodes, edges };
}

describe("generated code actually runs", () => {
  it("javascript executes and takes the correct branch", async () => {
    const { nodes, edges } = build();
    const res = generateCode(nodes, edges, "javascript");
    const printed: string[] = [];
    const fakeConsole = { log: (...args: unknown[]) => printed.push(args.join(" ")) };
    // the emission ends with `main();` (fire-and-forget) — strip it and await
    // main ourselves so assertions run after completion
    const code = res.code.replace(/^main\(\);$/m, "");
    const run = new Function("console", `${code}\nreturn main();`);
    await run(fakeConsole);
    expect(printed.join("\n")).toContain("HELLO BOARD");
    expect(printed.join("\n")).not.toContain("WRONG BRANCH");
  });

  it("python executes and takes the correct branch", () => {
    const { nodes, edges } = build();
    const res = generateCode(nodes, edges, "python");
    let out: string;
    try {
      out = execFileSync("python", ["-c", res.code], { encoding: "utf8", timeout: 30000 });
    } catch (err: unknown) {
      const e = err as { code?: string; stderr?: string };
      if (e.code === "ENOENT") return; // no Python on this machine — skip
      throw new Error(`generated Python failed to run: ${e.stderr ?? String(err)}`);
    }
    expect(out).toContain("HELLO BOARD");
    expect(out).not.toContain("WRONG BRANCH");
  });

  it("simple passive math flow runs without error in both languages", () => {
    const { nodes, edges } = materializeNlGraph(
      {
        nodes: [
          { id: "n1", type: "constNum", config: { value: 2 } },
          { id: "n2", type: "constNum", config: { value: 40 } },
          { id: "n3", type: "mathNode", config: { expression: "a + b" } },
          { id: "t", type: "triggerInput", config: {} },
          { id: "log", type: "loggerNode", config: {} },
        ],
        edges: [
          { source: "n1", sourceHandle: "value", target: "n3", targetHandle: "a" },
          { source: "n2", sourceHandle: "value", target: "n3", targetHandle: "b" },
          { source: "n3", sourceHandle: "out", target: "log", targetHandle: "value" },
          { source: "t", sourceHandle: "triggerOut", target: "log", targetHandle: "inTrigger" },
        ],
      },
      "s"
    );
    // JS
    const js = generateCode(nodes, edges, "javascript");
    const printed: string[] = [];
    const run = new Function(
      "console",
      `${js.code.replace(/^main\(\);$/m, "")}\nreturn main();`
    );
    return Promise.resolve(run({ log: (...a: unknown[]) => printed.push(a.join(" ")) })).then(() => {
      expect(printed.join("\n")).toContain("42");
      // Python
      const py = generateCode(nodes, edges, "python");
      try {
        const out = execFileSync("python", ["-c", py.code], { encoding: "utf8", timeout: 30000 });
        expect(out).toContain("42");
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "ENOENT") return;
        throw err;
      }
    });
  });
});
