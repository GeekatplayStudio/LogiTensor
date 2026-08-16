import { describe, it, expect } from "vitest";
import { buildNodeSchema, materializeNlGraph } from "../nl-apply";

describe("buildNodeSchema", () => {
  it("exposes data-input defaults so the model knows what it can set", () => {
    const schema = buildNodeSchema() as { type: string; inputs: string[] }[];
    const split = schema.find((s) => s.type === "splitTextNode");
    // Without the default shown, a model has no way to discover that the
    // delimiter is settable at all — it guessed `config.delimiter` instead.
    expect(split?.inputs.some((i) => i.startsWith("delimiter(string="))).toBe(true);
  });

  it("marks trigger ports distinctly from data ports", () => {
    const schema = buildNodeSchema() as { type: string; inputs: string[] }[];
    const logger = schema.find((s) => s.type === "loggerNode");
    expect(logger?.inputs).toContain("inTrigger(trigger)");
  });
});

describe("materializeNlGraph input values", () => {
  it("applies `inputs` to the matching data port", () => {
    const { nodes } = materializeNlGraph({
      nodes: [{ id: "a", type: "splitTextNode", inputs: { delimiter: " " } }],
    });
    expect(nodes[0].data.inputs.find((i) => i.id === "delimiter")?.value).toBe(" ");
  });

  it("routes a port value mistakenly placed in config instead of rejecting it", () => {
    // The exact mistake seen in a real build: the model wrote
    // config: { delimiter: " " } for a value that lives on an input port.
    const { nodes, problems } = materializeNlGraph({
      nodes: [{ id: "a", type: "splitTextNode", config: { delimiter: " " } }],
    });
    expect(nodes[0].data.inputs.find((i) => i.id === "delimiter")?.value).toBe(" ");
    expect(problems.join(" ")).not.toMatch(/delimiter/);
  });

  it("still reports a genuinely unknown key", () => {
    const { problems } = materializeNlGraph({
      nodes: [{ id: "a", type: "splitTextNode", config: { nonsense: 1 } }],
    });
    expect(problems.join(" ")).toMatch(/nonsense/);
  });

  it("does not let `inputs` write to a trigger port", () => {
    const { nodes, problems } = materializeNlGraph({
      nodes: [{ id: "a", type: "loggerNode", inputs: { inTrigger: true } }],
    });
    expect(problems.join(" ")).toMatch(/inTrigger/);
    expect(nodes[0].data.inputs.find((i) => i.id === "inTrigger")?.value).toBeUndefined();
  });
});
