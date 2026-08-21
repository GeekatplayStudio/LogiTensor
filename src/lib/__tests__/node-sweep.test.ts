import { describe, it, expect } from "vitest";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { computeNodeOutputs, handleTriggerOperation } from "../execution-helpers";

// Registry-wide health sweep: EVERY node type must survive its own compute
// with default inputs, and every trigger-driven type must survive its trigger
// operation on each of its trigger ports. This is the "check every node"
// safety net — a node added with a broken compute or trigger op fails here
// even before it has a dedicated vector test.

/** default input record straight from the definition's port defaults */
function defaultInputs(type: string): Record<string, unknown> {
  const def = NODE_DEFINITIONS[type];
  const inputs: Record<string, unknown> = {};
  for (const p of def.inputs) {
    if (p.type === "data" && p.value !== undefined) inputs[p.id] = p.value;
  }
  // keep the sweep fast — delay-style nodes wait for real wall-clock time
  if ("delayMs" in inputs || def.inputs.some((p) => p.id === "delayMs")) inputs.delayMs = 0;
  return inputs;
}

const ALL_TYPES = Object.keys(NODE_DEFINITIONS);

describe("node registry sweep", () => {
  it("covers a sane number of node types", () => {
    expect(ALL_TYPES.length).toBeGreaterThanOrEqual(79);
  });

  for (const type of ALL_TYPES) {
    const def = NODE_DEFINITIONS[type];

    it(`${def.label} (${type}): compute with default inputs does not throw`, () => {
      const out = computeNodeOutputs(type, defaultInputs(type), { ...(def.config ?? {}) });
      expect(out).toBeTypeOf("object");
    });

    const triggerPorts = def.inputs.filter((p) => p.type === "trigger");
    if (triggerPorts.length > 0) {
      it(`${def.label} (${type}): trigger op on each trigger port does not throw`, async () => {
        for (const port of triggerPorts) {
          const res = await handleTriggerOperation(
            type,
            defaultInputs(type),
            { ...(def.config ?? {}) },
            port.id
          );
          expect(res).toHaveProperty("nextTriggerPort");
        }
      });
    }
  }
});

describe("counter node logic (the reported problem area)", () => {
  it("inc, dec, and reset update count correctly and chain onward", async () => {
    let config: Record<string, unknown> = { count: 0 };
    const fire = async (port: string) => {
      const res = await handleTriggerOperation("counterNode", {}, config, port);
      if (res.updatedConfig) config = res.updatedConfig;
      return res;
    };

    await fire("incTrigger");
    await fire("incTrigger");
    expect(config.count).toBe(2);

    await fire("decTrigger");
    expect(config.count).toBe(1);

    await fire("resetTrigger");
    expect(config.count).toBe(0);

    // dec below zero must not wedge — document actual engine behavior
    await fire("decTrigger");
    expect(config.count).toBe(-1);
  });

  it("survives a missing/garbage count in config", async () => {
    const res = await handleTriggerOperation("counterNode", {}, { count: "not-a-number" }, "incTrigger");
    expect(Number.isNaN(res.updatedConfig?.count)).toBe(false);
  });
});
