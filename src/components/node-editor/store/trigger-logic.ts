import { StoreApi } from "zustand";
import { handleTriggerOperation, resolveConditionFlag } from "@/lib/execution-helpers";
import { toast } from "sonner";
import { NodeEditorState } from "./types";

/**
 * Executes a single trigger-driven step on `targetNodeId`/`targetPortId`:
 * refreshes its inputs, runs loop-node special-casing or
 * `handleTriggerOperation`, applies any resulting config change, and reports
 * what should happen next. Shared by `triggerNode` (fired from a real
 * trigger edge) and `fireTriggerInput` (fired from a rising-edge data wire)
 * — both just differ in how they animate the thing that caused the fire.
 */
export async function runTriggerLogic(
  get: StoreApi<NodeEditorState>["getState"],
  set: StoreApi<NodeEditorState>["setState"],
  targetNodeId: string,
  targetPortId: string
): Promise<{ nextTriggerPort: string | null; status: "success" | "error"; errorMsg: string }> {
  // Refresh inputs on target node
  get().evaluateNode(targetNodeId);

  const edges = get().edges;
  const currentNodes = get().nodes;
  const currentTargetNode = currentNodes.find((n) => n.id === targetNodeId)!;

  let nextTriggerPort: string | null = null;
  let status: "success" | "error" = "success";
  let errorMsg = "";

  try {
    // Gather current input port values
    const inputs: Record<string, any> = {};
    for (const input of currentTargetNode.data.inputs) {
      const edge = edges.find(
        (e) => e.target === targetNodeId && e.targetHandle === input.id
      );
      if (edge) {
        const sourceNode = currentNodes.find((n) => n.id === edge.source);
        const sourcePort = sourceNode?.data.outputs.find(
          (o) => o.id === edge.sourceHandle
        );
        inputs[input.id] = sourcePort ? sourcePort.value : input.value;
      } else {
        inputs[input.id] = input.value;
      }
    }

    // Publishes a loop counter onto the loop node's config + outputs and
    // re-evaluates so downstream data consumers see the fresh value.
    const publishLoopValue = (key: string, value: number) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === targetNodeId
            ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
            : n
        ),
      }));
      get().evaluateNode(targetNodeId);
    };

    if (currentTargetNode.type === "forLoopNode") {
      const count = Math.max(0, Math.min(1000, Number(inputs.count ?? 3)));
      for (let i = 0; i < count; i++) {
        publishLoopValue("index", i);
        await get().triggerNode(targetNodeId, "loopBody");
      }
      nextTriggerPort = "done";
    } else if (currentTargetNode.type === "whileLoopNode") {
      const condEdge = get().edges.find(
        (e) => e.target === targetNodeId && e.targetHandle === "condition"
      );
      let iteration = 0;
      while (iteration < 1000) {
        publishLoopValue("iteration", iteration);
        // Re-evaluate the condition's upstream chain each pass — the loop
        // body may have changed the values feeding it (e.g. a counter).
        let condVal: any;
        if (condEdge) {
          get().evaluateNode(condEdge.source);
          const srcNode = get().nodes.find((n) => n.id === condEdge.source);
          condVal = srcNode?.data.outputs.find((o) => o.id === condEdge.sourceHandle)?.value;
        } else {
          condVal = get()
            .nodes.find((n) => n.id === targetNodeId)
            ?.data.inputs.find((i) => i.id === "condition")?.value;
        }
        if (!resolveConditionFlag(condVal)) break;
        await get().triggerNode(targetNodeId, "loopBody");
        iteration++;
      }
      if (iteration >= 1000) {
        toast.error("While Loop stopped: 1000-iteration safety cap reached");
      }
      nextTriggerPort = "done";
    } else {
      // Handle operations triggered by execution flow using the execution helper
      const triggerRes = await handleTriggerOperation(
        currentTargetNode.type || "",
        inputs,
        currentTargetNode.data.config || {},
        targetPortId || ""
      );
      nextTriggerPort = triggerRes.nextTriggerPort;

      if (triggerRes.updatedConfig) {
        set((state) => ({
          nodes: state.nodes.map((n) => {
            if (n.id === targetNodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  config: triggerRes.updatedConfig,
                },
              };
            }
            return n;
          }),
        }));
      }

      // Any node that mutated its own stored state (counter, toggle, latch,
      // list append, …) must re-publish its data outputs so downstream data
      // consumers see the new value immediately.
      if (triggerRes.updatedConfig) {
        get().evaluateNode(targetNodeId);
      }
    }
  } catch (err: any) {
    status = "error";
    errorMsg = err.message || "Execution flow error";
  }

  return { nextTriggerPort, status, errorMsg };
}
