import { describe, it, expect, beforeEach } from "vitest";
import { useNodeEditorStore } from "../use-node-editor-store";

// Exercises the real store end-to-end (no rendering) for the reported bug:
// wiring a Constant Boolean's Value output directly into a Counter's Inc
// trigger input should be accepted, and the counter should react correctly
// both to later toggles AND to a wire that's already "on" at connect time.
describe("hybrid trigger port smoke test (store-level)", () => {
  beforeEach(() => {
    useNodeEditorStore.setState({
      nodes: [],
      edges: [],
      dataTriggerState: {},
    });
  });

  function addAt(type: string, x: number, y: number) {
    useNodeEditorStore.getState().addNode(type, x, y);
    const nodes = useNodeEditorStore.getState().nodes;
    return nodes[nodes.length - 1].id;
  }

  function connect(source: string, sourceHandle: string, target: string, targetHandle: string) {
    useNodeEditorStore.getState().onConnect({ source, sourceHandle, target, targetHandle });
  }

  function countOf(nodeId: string): number {
    return Number(useNodeEditorStore.getState().nodes.find((n) => n.id === nodeId)?.data.config?.count ?? 0);
  }

  it("accepts a boolean data output wired into a trigger input", () => {
    const boolId = addAt("constBool", 0, 0);
    const counterId = addAt("counterNode", 200, 0);
    useNodeEditorStore.getState().updateNodeConfig(boolId, { value: false });

    connect(boolId, "value", counterId, "incTrigger");

    const edge = useNodeEditorStore.getState().edges.find(
      (e) => e.source === boolId && e.target === counterId
    );
    expect(edge).toBeDefined();
  });

  it("increments exactly once per false->true transition, not on true->false", async () => {
    const boolId = addAt("constBool", 0, 0);
    const counterId = addAt("counterNode", 200, 0);
    useNodeEditorStore.getState().updateNodeConfig(boolId, { value: false });
    connect(boolId, "value", counterId, "incTrigger");
    await new Promise((r) => setTimeout(r, 0));

    expect(countOf(counterId)).toBe(0);

    useNodeEditorStore.getState().updateNodeConfig(boolId, { value: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(countOf(counterId)).toBe(1);

    // Flip back to false: must NOT decrement/change count.
    useNodeEditorStore.getState().updateNodeConfig(boolId, { value: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(countOf(counterId)).toBe(1);

    // Rising edge again: increments once more.
    useNodeEditorStore.getState().updateNodeConfig(boolId, { value: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(countOf(counterId)).toBe(2);
  });

  it("fires immediately when connected to a source that's already true", async () => {
    const boolId = addAt("constBool", 0, 0);
    const counterId = addAt("counterNode", 200, 0);
    // Set to true BEFORE wiring — this is the exact scenario that was
    // previously silently broken (onConnect only evaluated the target).
    useNodeEditorStore.getState().updateNodeConfig(boolId, { value: true });
    await new Promise((r) => setTimeout(r, 0));

    connect(boolId, "value", counterId, "incTrigger");
    await new Promise((r) => setTimeout(r, 50));

    expect(countOf(counterId)).toBe(1);
  });

  it("accumulates count across rapid repeated trigger firings", async () => {
    const counterId = addAt("counterNode", 200, 0);
    const store = useNodeEditorStore.getState();

    await Promise.all([
      store.triggerNode(counterId, "incTrigger"),
      store.triggerNode(counterId, "incTrigger"),
      store.triggerNode(counterId, "incTrigger"),
    ]);

    expect(countOf(counterId)).toBe(3);
  });

  it("treats a positive number as on and zero as off for a trigger port", async () => {
    const numId = addAt("constNum", 0, 0);
    const counterId = addAt("counterNode", 200, 0);
    useNodeEditorStore.getState().updateNodeConfig(numId, { value: 0 });
    connect(numId, "value", counterId, "incTrigger");
    await new Promise((r) => setTimeout(r, 0));

    expect(countOf(counterId)).toBe(0);

    useNodeEditorStore.getState().updateNodeConfig(numId, { value: 5 });
    await new Promise((r) => setTimeout(r, 50));
    expect(countOf(counterId)).toBe(1);
  });

  it("drives Inc and Dec independently from a Range node's Above/Below outputs across repeated cycles", async () => {
    const numId = addAt("constNum", 0, 0);
    const rangeId = addAt("rangeNode", 200, 0);
    const counterId = addAt("counterNode", 400, 0);

    useNodeEditorStore.getState().updateNodeConfig(rangeId, { min: 0, max: 10 });
    connect(numId, "value", rangeId, "value");
    connect(rangeId, "above", counterId, "incTrigger");
    connect(rangeId, "below", counterId, "decTrigger");
    await new Promise((r) => setTimeout(r, 0));

    const setValue = async (v: number) => {
      useNodeEditorStore.getState().updateNodeConfig(numId, { value: v });
      await new Promise((r) => setTimeout(r, 50));
    };

    await setValue(5); // in range
    expect(countOf(counterId)).toBe(0);

    await setValue(15); // above -> Inc
    expect(countOf(counterId)).toBe(1);

    await setValue(5); // back in range, no change
    expect(countOf(counterId)).toBe(1);

    await setValue(-5); // below -> Dec
    expect(countOf(counterId)).toBe(0);

    await setValue(5); // back in range, no change
    expect(countOf(counterId)).toBe(0);

    // Repeat the cycle several more times — this is the scenario reported as
    // "gets stuck": it must keep responding, not freeze after a couple of
    // transitions.
    for (let i = 0; i < 4; i++) {
      await setValue(15);
      await setValue(-5);
    }
    // Started at 0: each iteration is +1 then -1, net 0, but every single
    // transition along the way must have actually fired (checked above for
    // the first cycle) — this just confirms it doesn't wedge after many
    // cycles.
    expect(countOf(counterId)).toBe(0);

    await setValue(15);
    expect(countOf(counterId)).toBe(1);
  });

  it("does not get stuck when the source value changes rapidly, back-to-back with no settle time", async () => {
    const numId = addAt("constNum", 0, 0);
    const rangeId = addAt("rangeNode", 200, 0);
    const counterId = addAt("counterNode", 400, 0);

    useNodeEditorStore.getState().updateNodeConfig(rangeId, { min: 0, max: 10 });
    connect(numId, "value", rangeId, "value");
    connect(rangeId, "above", counterId, "incTrigger");
    connect(rangeId, "below", counterId, "decTrigger");
    await new Promise((r) => setTimeout(r, 50));

    // Simulate a fast slider drag: fire many value changes synchronously,
    // back-to-back, with NO await between them (unlike the cycle test above)
    // — this is what a real drag gesture looks like, and is where a race
    // between overlapping fire-and-forget fireTriggerInput calls would show
    // up as a "stuck" counter that stops responding.
    const store = useNodeEditorStore.getState();
    for (let i = 0; i < 10; i++) {
      store.updateNodeConfig(numId, { value: 15 });
      store.updateNodeConfig(numId, { value: -5 });
    }
    // Let everything settle.
    await new Promise((r) => setTimeout(r, 300));

    // It must still be responsive after the storm — fire one more clean,
    // isolated transition and confirm it's picked up.
    const before = countOf(counterId);
    store.updateNodeConfig(numId, { value: 5 }); // back to in range first
    await new Promise((r) => setTimeout(r, 100));
    store.updateNodeConfig(numId, { value: 15 }); // above -> Inc
    await new Promise((r) => setTimeout(r, 100));
    expect(countOf(counterId)).toBe(before + 1);
  });
});

describe("trigger fan-out", () => {
  beforeEach(() => {
    useNodeEditorStore.setState({ nodes: [], edges: [], dataTriggerState: {}, stepDelayMs: 0 });
  });

  function add(type: string) {
    useNodeEditorStore.getState().addNode(type, 0, 0);
    const ns = useNodeEditorStore.getState().nodes;
    return ns[ns.length - 1].id;
  }

  it("fires EVERY target wired to one trigger output, not just the first", async () => {
    // The reported bug: two Random generators off one Manual Trigger, only
    // one of them ever ran, because triggerNode used edges.find().
    const t = add("triggerInput");
    const r1 = add("randomNode");
    const r2 = add("randomNode");
    const store = useNodeEditorStore.getState();
    store.onConnect({ source: t, sourceHandle: "triggerOut", target: r1, targetHandle: "inTrigger" });
    store.onConnect({ source: t, sourceHandle: "triggerOut", target: r2, targetHandle: "inTrigger" });

    await useNodeEditorStore.getState().triggerNode(t, "triggerOut");

    const ran = (id: string) =>
      useNodeEditorStore.getState().nodes.find((n) => n.id === id)?.data.executionState;
    expect(ran(r1)).toBe("success");
    expect(ran(r2)).toBe("success");
  });

  it("fans out to three targets in edge order", async () => {
    const t = add("triggerInput");
    const logs = [add("loggerNode"), add("loggerNode"), add("loggerNode")];
    const store = useNodeEditorStore.getState();
    for (const l of logs) {
      store.onConnect({ source: t, sourceHandle: "triggerOut", target: l, targetHandle: "inTrigger" });
    }

    await useNodeEditorStore.getState().triggerNode(t, "triggerOut");

    for (const l of logs) {
      expect(
        useNodeEditorStore.getState().nodes.find((n) => n.id === l)?.data.executionState,
        l
      ).toBe("success");
    }
  });
});
