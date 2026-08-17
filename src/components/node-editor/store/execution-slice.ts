import { StoreApi } from "zustand";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "@/types/nodes";
import { computeNodeOutputs } from "@/lib/execution-helpers";
import { resolveTriggerFire } from "@/lib/trigger-bridge";
import { getPortColor } from "@/lib/node-styles";
import { edgeValueLabel, idleEdgeStyle, litEdgeStyle } from "@/lib/edge-styles";
import { toast } from "sonner";
import { NodeEditorState } from "./types";
import {
  applyComputedOutputs,
  combineDimensionValues,
  resolveNodeInputs,
} from "./graph-helpers";
import { runTriggerLogic } from "./trigger-logic";
import { breakpointGate, nodeLabelOf, pauseGate } from "./run-all-helpers";
import { executeRunAll } from "./run-all-backend";
import { logEvent } from "@/lib/debug-log";

type Setter = StoreApi<NodeEditorState>["setState"];
type Getter = StoreApi<NodeEditorState>["getState"];

const pendingTriggerRuns = new Map<string, Promise<void>>();

async function runSerializedTrigger(key: string, task: () => Promise<void>) {
  const previous = pendingTriggerRuns.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingTriggerRuns.set(key, previous.then(() => current, () => current));

  await previous;
  try {
    await task();
  } finally {
    release?.();
    if (pendingTriggerRuns.get(key) === current) {
      pendingTriggerRuns.delete(key);
    }
  }
}

/**
 * Runs one trigger edge: animates the wire, honors breakpoints/pause, executes
 * the target node, then continues down whatever that node fires next. Split out
 * of triggerNode so a fan-out can await each target's full chain in turn.
 */
async function fireTriggerEdge(
  get: Getter,
  set: Setter,
  sourceNodeId: string,
  outputPortId: string,
  triggerEdge: Edge
): Promise<void> {
  const targetNodeId = triggerEdge.target;
  const targetPortId = triggerEdge.targetHandle;
  const targetNode = get().nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) return;

  logEvent(
    "debug",
    "exec",
    `Trigger: ${nodeLabelOf(get, sourceNodeId)}.${outputPortId} → ${targetNode.data.label}.${targetPortId ?? "?"}`
  );

  // Stop before the target node runs if a breakpoint is armed on it.
  await breakpointGate(get, set, targetNodeId);

  // 1. Indicate the node is processing/running, and light up the trigger
  // wire carrying this signal so you can see execution travel through it.
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === targetNodeId ? { ...n, data: { ...n.data, executionState: "running" as const } } : n
    ),
    edges: state.edges.map((e) =>
      e.id === triggerEdge.id
        ? { ...e, animated: true, style: litEdgeStyle(getPortColor("trigger"), 2.5) }
        : e
    ),
  }));

  // Give visual animation a moment, and honor step-through pause mode.
  await new Promise((r) => setTimeout(r, get().stepDelayMs));
  await pauseGate(get, set);

  // 2/3. Refresh inputs, run the node's trigger logic, and determine
  // what (if anything) fires next.
  const { nextTriggerPort, status, errorMsg } = await runTriggerLogic(
    get,
    set,
    targetNodeId,
    targetPortId || ""
  );

  if (status === "error") {
    logEvent("error", "exec", `Trigger failed: ${targetNode.data.label}`, errorMsg);
  }

  // Mark execution status; settle the trigger wire into lit (success)
  // or dim (error) rather than leaving it mid-animation.
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === targetNodeId
        ? {
            ...n,
            data: {
              ...n.data,
              executionState: status,
              errorMessage: errorMsg || undefined,
              lastExecuted: new Date().toISOString(),
            },
          }
        : n
    ),
    edges: state.edges.map((e) =>
      e.id === triggerEdge.id
        ? {
            ...e,
            animated: status === "success",
            style:
              status === "success"
                ? litEdgeStyle(getPortColor("trigger"), 2.5)
                : idleEdgeStyle(2.5),
          }
        : e
    ),
  }));

  // Trigger downstream evaluations
  get().evaluateNode(targetNodeId);

  // Call next trigger node in sequence if valid
  if (nextTriggerPort && status === "success") {
    await get().triggerNode(targetNodeId, nextTriggerPort);
  }
}

export const createExecutionSlice = (set: Setter, get: Getter) => ({
  dataTriggerState: {} as Record<string, boolean>,
  isPaused: false,
  stepRequested: false,
  breakpoints: {} as Record<string, true>,

  setIsPaused: (paused: boolean) => {
    set({ isPaused: paused, stepRequested: false });
    logEvent("info", "exec", paused ? "Execution paused" : "Execution resumed");
  },

  stepOnce: () => {
    set({ stepRequested: true });
    logEvent("debug", "exec", "Step requested");
  },

  toggleBreakpoint: (nodeId: string) => {
    const label = nodeLabelOf(get, nodeId);
    set((state) => {
      const next = { ...state.breakpoints };
      if (next[nodeId]) delete next[nodeId];
      else next[nodeId] = true;
      return { breakpoints: next };
    });
    logEvent(
      "info",
      "exec",
      `${get().breakpoints[nodeId] ? "Breakpoint set" : "Breakpoint cleared"}: ${label}`
    );
  },

  clearBreakpoints: () => {
    const count = Object.keys(get().breakpoints).length;
    if (count === 0) return;
    set({ breakpoints: {} });
    logEvent("info", "exec", `Cleared ${count} breakpoint(s)`);
  },

  // Evaluate a node's output data variables reactively
  evaluateNode: (nodeId: string) => {
    const { nodes, edges, layers, activeLayerId } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const sharedId = node.data.config?.isMultiDimensional ? node.data.config?.sharedId : null;

    let outputs: Record<string, any> = {};
    let executionState: "idle" | "error" = "idle";
    let errorMessage: string | undefined = undefined;

    if (sharedId) {
      // Multi-dimensional node: gather this node's instance from every dimension
      // (the active layer's instance comes from live state, others from `layers`).
      const instances = layers
        .map((l) => {
          if (l.id === activeLayerId) {
            const instance = nodes.find((n) => n.data.config?.sharedId === sharedId);
            return instance ? { nodeList: nodes, edgeList: edges, instance } : null;
          }
          const instance = l.nodes.find((n) => n.data.config?.sharedId === sharedId);
          return instance ? { nodeList: l.nodes, edgeList: l.edges, instance } : null;
        })
        .filter((x): x is { nodeList: Node<NodeData>[]; edgeList: Edge[]; instance: Node<NodeData> } => !!x);

      // Combine each input port's value across every dimension's instance —
      // this is the "process as multiple inputs" step (sum numbers, OR booleans, etc.)
      const combinedInputs: Record<string, any> = {};
      for (const inputDef of node.data.inputs) {
        if (inputDef.type === "trigger") continue;
        const values = instances.map(({ instance, nodeList, edgeList }) =>
          resolveNodeInputs(instance, nodeList, edgeList)[inputDef.id]
        );
        combinedInputs[inputDef.id] = combineDimensionValues(values);
      }

      try {
        outputs = computeNodeOutputs(node.type || "", combinedInputs, node.data.config || {});
      } catch (err: any) {
        executionState = "error";
        errorMessage = err.message || "Evaluation error";
        logEvent("error", "exec", `Evaluate failed: ${node.data.label}`, errorMessage);
      }

      // Broadcast the single combined output onto every dimension's instance.
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.data.config?.sharedId === sharedId
            ? applyComputedOutputs(n, outputs, executionState, errorMessage)
            : n
        ),
        layers: state.layers.map((l) => {
          if (l.id === activeLayerId) return l;
          return {
            ...l,
            nodes: l.nodes.map((n) =>
              n.data.config?.sharedId === sharedId
                ? applyComputedOutputs(n, outputs, executionState, errorMessage)
                : n
            ),
          };
        }),
      }));
    } else {
      const inputs = resolveNodeInputs(node, nodes, edges);

      try {
        outputs = computeNodeOutputs(node.type || "", inputs, node.data.config || {});
      } catch (err: any) {
        executionState = "error";
        errorMessage = err.message || "Evaluation error";
        logEvent("error", "exec", `Evaluate failed: ${node.data.label}`, errorMessage);
      }

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? applyComputedOutputs(n, outputs, executionState, errorMessage) : n
        ),
      }));
    }

    // Light up outgoing data edges with the value that just flowed — both the
    // color AND a value pill (previously only the backend runAll path showed
    // values; interactive runs now display them identically).
    set((state) => ({
      edges: state.edges.map((e) => {
        if (e.source !== nodeId) return e;
        const sourcePort = node.data.outputs.find((o) => o.id === e.sourceHandle);
        if (!sourcePort || sourcePort.type !== "data") return e;
        const hasValue = executionState !== "error" && outputs[e.sourceHandle ?? ""] !== undefined;
        const portColor = getPortColor("data", sourcePort.dataType);
        return {
          ...e,
          ...edgeValueLabel(hasValue ? outputs[e.sourceHandle ?? ""] : undefined, portColor),
          style: hasValue ? litEdgeStyle(portColor, 2) : idleEdgeStyle(2),
        };
      }),
    }));

    // Propagate to downstream data nodes within the active layer — or, if
    // this data wire lands on a trigger port (a hybrid data→trigger
    // connection), fire it once on a rising edge (false/0 -> true/1) instead
    // of recursing into a plain re-evaluate.
    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      const sourcePort = node.data.outputs.find((o) => o.id === edge.sourceHandle);
      if (!sourcePort || sourcePort.type !== "data") continue;

      const targetNode = nodes.find((n) => n.id === edge.target);
      const targetPort = targetNode?.data.inputs.find((i) => i.id === edge.targetHandle);

      if (targetPort?.type === "trigger") {
        const key = `${edge.target}:${edge.targetHandle}`;
        const isOn = resolveTriggerFire(outputs[edge.sourceHandle ?? ""]);
        const wasOn = get().dataTriggerState[key] ?? false;
        if (isOn !== wasOn) {
          set((state) => ({ dataTriggerState: { ...state.dataTriggerState, [key]: isOn } }));
        }
        if (isOn && !wasOn) {
          void get().fireTriggerInput(edge.target, edge.targetHandle || "");
        }
      } else {
        get().evaluateNode(edge.target);
      }
    }
  },

  // Propagates trigger commands through trigger connection lines.
  // A trigger output can fan out to several targets; each one's whole
  // downstream chain runs to completion before the next starts. This used to
  // use edges.find() — singular — so wiring one trigger to two nodes silently
  // ran only the first (e.g. two Random generators, only one firing).
  triggerNode: async (nodeId: string, outputPortId: string) => {
    await runSerializedTrigger(`trigger:${nodeId}`, async () => {
      const fanOut = get().edges.filter(
        (e) => e.source === nodeId && e.sourceHandle === outputPortId
      );
      if (fanOut.length > 1) {
        logEvent(
          "debug",
          "exec",
          `Trigger fan-out: ${nodeLabelOf(get, nodeId)}.${outputPortId} → ${fanOut.length} targets`
        );
      }
      for (const edge of fanOut) {
        await fireTriggerEdge(get, set, nodeId, outputPortId, edge);
      }
    });
  },

  // Fires a trigger input port directly — no trigger edge required. Used
  // when a boolean/number data wire lands on a trigger port and rises from
  // off to on (see the downstream loop in evaluateNode). Runs the same
  // per-node trigger logic as triggerNode; the only difference is there's no
  // trigger wire to animate (the causing data edge is already lit by
  // evaluateNode's own data-edge styling).
  fireTriggerInput: async (nodeId: string, portId: string) => {
    await runSerializedTrigger(`trigger:${nodeId}`, async () => {
      if (!get().nodes.some((n) => n.id === nodeId)) return;

      logEvent("debug", "exec", `Rising edge fired: ${nodeLabelOf(get, nodeId)}.${portId}`);

      // Breakpoints apply to data-driven trigger fires too, not just wired ones.
      await breakpointGate(get, set, nodeId);

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, executionState: "running" as const } } : n
        ),
      }));

      const { nextTriggerPort, status, errorMsg } = await runTriggerLogic(get, set, nodeId, portId);

      if (status === "error") {
        logEvent("error", "exec", `Trigger failed: ${nodeLabelOf(get, nodeId)}`, errorMsg);
      }

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  executionState: status,
                  errorMessage: errorMsg || undefined,
                  lastExecuted: new Date().toISOString(),
                },
              }
            : n
        ),
      }));

      get().evaluateNode(nodeId);

      if (nextTriggerPort && status === "success") {
        await get().triggerNode(nodeId, nextTriggerPort);
      }
    });
  },

  // Backend compile + run lives in run-all-backend.ts (500-line guardrail).
  runAll: () => executeRunAll(get, set),

  // Last-run diagnostics; filled by executeRunAll, consumed by the Run Report.
  lastRun: undefined,

  // Visual run-through: fires every Manual Trigger in sequence on the live
  // canvas (values light up edge-by-edge), then reads every Expected Value
  // node's verdict and reports a pass/fail summary — in-canvas testing.
  runTests: async () => {
    if (get().isRunning) return;
    set({ isRunning: true });
    try {
      const triggers = get().nodes.filter((n) => n.type === "triggerInput");
      if (triggers.length === 0) {
        toast.warning("No Manual Trigger nodes to fire.");
        logEvent("warn", "exec", "Run tests: no Manual Trigger nodes on the board");
        return;
      }
      for (const t of triggers) {
        await get().triggerNode(t.id, "triggerOut");
      }
      const asserts = get().nodes.filter((n) => n.type === "assertNode");
      let passed = 0;
      for (const a of asserts) {
        get().evaluateNode(a.id);
        const ok = Boolean(
          get().nodes.find((n) => n.id === a.id)?.data.outputs.find((o) => o.id === "pass")?.value
        );
        if (ok) passed += 1;
        // success/error ring makes each verdict visible on the node itself
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === a.id
              ? { ...n, data: { ...n.data, executionState: ok ? ("success" as const) : ("error" as const), errorMessage: ok ? undefined : "Expectation failed" } }
              : n
          ),
        }));
      }
      if (asserts.length === 0) {
        toast.success(`Fired ${triggers.length} trigger(s). Add Expected Value nodes to assert results.`);
        logEvent("info", "exec", `Fired ${triggers.length} trigger(s); no expectations to check`);
      } else if (passed === asserts.length) {
        toast.success(`All ${asserts.length} expectation(s) passed ✔`);
        logEvent("success", "exec", `All ${asserts.length} expectation(s) passed`);
      } else {
        toast.error(`${asserts.length - passed} of ${asserts.length} expectation(s) failed`);
        logEvent("error", "exec", `${asserts.length - passed} of ${asserts.length} expectation(s) failed`);
      }
    } finally {
      set({ isRunning: false });
    }
  },

  resetExecutionStates: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionState: "idle" as const,
          errorMessage: undefined,
          // If it is a logger, we can clear the logs or preserve them. Let's preserve but reset status.
        },
      })),
      edges: state.edges.map((e) => ({
        ...e,
        animated: false,
        // Also clear the value pills — previously stale run values survived
        // Reset because only animated/style were restored.
        label: undefined,
        labelBgStyle: undefined,
        labelStyle: undefined,
        style: idleEdgeStyle((e.style as any)?.strokeWidth ?? 2),
      })),
    }));
  },
});
