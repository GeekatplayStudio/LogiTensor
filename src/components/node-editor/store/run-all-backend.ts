import { StoreApi } from "zustand";
import { toast } from "sonner";
import { logEvent, type LogLevel } from "@/lib/debug-log";
import { NodeEditorState } from "./types";
import { replayTrace, updateLayerEdges, updateLayerInputs, updateLayerNodes } from "./run-all-helpers";

type Setter = StoreApi<NodeEditorState>["setState"];
type Getter = StoreApi<NodeEditorState>["getState"];

// The backend tags each log line with a severity word; map the ones it emits
// onto our terminal levels so a Python-side warning still reads as a warning.
const BACKEND_LEVELS: Record<string, LogLevel> = {
  debug: "debug",
  info: "info",
  success: "success",
  warn: "warn",
  warning: "warn",
  error: "error",
};

/** Replays the backend's own `logs` array into the terminal at source `backend`. */
function replayBackendLogs(logs: unknown): void {
  if (!Array.isArray(logs)) return;
  for (const line of logs) {
    if (typeof line === "string") {
      // Lines may be prefixed like "ERROR: ..." / "[warn] ..." — sniff the word.
      const marker = line.slice(0, 12).toLowerCase();
      const level = Object.keys(BACKEND_LEVELS).find((k) => marker.includes(k));
      logEvent(level ? BACKEND_LEVELS[level] : "info", "backend", line);
    } else {
      logEvent("info", "backend", JSON.stringify(line));
    }
  }
}

/**
 * Compiles the current federation to the Python/LangGraph backend, replays the
 * returned trace on the canvas, then settles results across every dimension.
 * Extracted from execution-slice.ts to keep that module under the 500-line
 * guardrail.
 */
export async function executeRunAll(get: Getter, set: Setter): Promise<void> {
  if (get().isRunning) return;
  set({ isRunning: true });

  const { runLoops, stepDelayMs, nodes, edges } = get();
  const loopsCount = runLoops || 1;
  const startedAt = Date.now();

  logEvent(
    "info",
    "exec",
    `Run started — ${nodes.length} node(s), ${edges.length} edge(s), ${loopsCount} loop(s)`
  );

  const toastId = toast.loading(`Starting execution loop (0/${loopsCount})...`);
  get().resetExecutionStates();

  try {
    for (let i = 0; i < loopsCount; i++) {
      if (loopsCount > 1) {
        toast.loading(`Executing loop (${i + 1}/${loopsCount})...`, { id: toastId });
        logEvent("debug", "exec", `Loop ${i + 1}/${loopsCount}`);
      }

      // Save current canvas layout to layers slot before compiling
      const { activeLayerId, nodes: liveNodes, edges: liveEdges, layers } = get();
      const currentLayers = layers.map((l) =>
        l.id === activeLayerId ? { ...l, nodes: liveNodes, edges: liveEdges } : l
      );

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiBaseUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeLayerId, layers: currentLayers }),
      });

      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errJson = await response.json();
          if (errJson && errJson.detail) errorDetail = errJson.detail;
        } catch {
          // ignore parsing error
        }
        throw new Error(`FastAPI Server error: ${errorDetail}`);
      }

      const res = await response.json();
      replayBackendLogs(res.logs);

      if (!res.success) throw new Error(res.error || "Compilation failed");

      // Walk the backend's execution order first so the canvas highlights
      // one node at a time at the configured Delay. Skipped at delay 0 so
      // "as fast as possible" stays instant.
      if (Array.isArray(res.trace) && res.trace.length > 0 && get().stepDelayMs > 0) {
        await replayTrace(get, set, res.trace, res.outputs);
      }

      // Then settle the full result across ALL dimension slots (this also
      // covers passive data nodes, which never appear in the trace).
      set((state) => {
        const updatedActiveNodesOutputs = updateLayerNodes(state.nodes, res.outputs);
        const updatedActiveEdges = updateLayerEdges(state.edges, updatedActiveNodesOutputs);
        const updatedActiveNodes = updateLayerInputs(
          updatedActiveNodesOutputs,
          updatedActiveEdges,
          res.outputs
        );

        const updatedLayers = state.layers.map((layer) => {
          if (layer.id === state.activeLayerId) {
            return { ...layer, nodes: updatedActiveNodes, edges: updatedActiveEdges };
          }
          const layerNodesOutputs = updateLayerNodes(layer.nodes, res.outputs);
          const layerEdges = updateLayerEdges(layer.edges, layerNodesOutputs);
          const layerNodes = updateLayerInputs(layerNodesOutputs, layerEdges, res.outputs);
          return { ...layer, nodes: layerNodes, edges: layerEdges };
        });

        return {
          nodes: updatedActiveNodes,
          edges: updatedActiveEdges,
          layers: updatedLayers,
        };
      });

      // Sleep between loops if loopsCount > 1
      if (i < loopsCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(100, stepDelayMs)));
      }
    }

    toast.dismiss(toastId);
    toast.success(
      loopsCount > 1
        ? `Completed ${loopsCount} loops successfully!`
        : "LangGraph execution completed successfully!"
    );
    logEvent(
      "success",
      "exec",
      `Run finished — ${loopsCount} loop(s) in ${Date.now() - startedAt}ms`
    );
  } catch (err: any) {
    toast.dismiss(toastId);
    toast.error(
      `LangGraph run failed: ${err.message}. Make sure Python FastAPI is running on port 8000.`
    );
    logEvent("error", "exec", "Run failed", err?.message ?? String(err));

    // Update execution state to error for all nodes
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, executionState: "error" as const, errorMessage: err.message },
      })),
    }));
  } finally {
    set({ isRunning: false });
  }
}
