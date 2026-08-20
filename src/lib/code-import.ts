import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import { buildNodeSchema, materializeNlGraph } from "./nl-apply";
import { verifyGraph, type VerifyReport } from "./graph-verify";
import { logEvent } from "./debug-log";

// The "Build Logic" pipeline: pasted source code → local LLM proposal →
// schema validation (nl-apply) → per-node verification (graph-verify) →
// canvas. Shared by the code panel; the NL bar uses the same backend with
// mode:"prompt". Nothing the model says reaches the canvas unvalidated.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface BuildLogicOptions {
  /** replace the board or add alongside the existing graph */
  mode: "replace" | "add";
  /** Ollama model name; empty = backend picks the most capable installed */
  model?: string;
}

export interface BuildLogicOutcome {
  nodeCount: number;
  edgeCount: number;
  problems: string[];
  connectivity: string[];
  verify: VerifyReport;
  model?: string;
}

/**
 * Analyzes pasted source code and rebuilds it as a node graph on the canvas.
 * Throws with a user-readable message on failure; on success the graph is
 * already applied and evaluated, and the returned outcome carries everything
 * the UI needs to report (problems, wiring notes, per-node verification).
 */
export async function buildLogicFromCode(code: string, opts: BuildLogicOptions): Promise<BuildLogicOutcome> {
  const say = logEvent;
  const schema = buildNodeSchema();
  say("info", "ai", `Build Logic: analyzing ${code.split("\n").length} lines of code (model: ${opts.model || "auto"})`);

  const started = Date.now();
  const res = await fetch(`${API_URL}/nl-build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: code, schema, mode: "code", model: opts.model ?? "" }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    say("error", "ai", data.error || data.detail || `HTTP ${res.status}`, data.raw);
    throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  }
  say("info", "ai", `Model replied in ${((Date.now() - started) / 1000).toFixed(1)}s`, data.raw);

  const { nodes, edges, problems, connectivity } = materializeNlGraph(data.graph, `code_${Date.now()}`);
  if (nodes.length === 0) throw new Error("No valid nodes could be read from this code.");

  // Verify BEFORE applying, so the report describes exactly what will land.
  const verify = verifyGraph(nodes, edges);
  say(
    verify.errors ? "error" : verify.warnings ? "warn" : "success",
    "ai",
    `Build Logic verification: ${verify.summary}`,
    verify.findings.map((f) => `[${f.level}] ${f.label}: ${f.message}`).join("\n") || undefined
  );

  if (opts.mode === "replace") {
    useNodeEditorStore.setState({ nodes, edges, dataTriggerState: {} });
  } else {
    useNodeEditorStore.setState((s) => ({ nodes: [...s.nodes, ...nodes], edges: [...s.edges, ...edges] }));
  }
  // Same post-load pass loadFromFile does — evaluate everything once so ports
  // and edges show live values immediately.
  setTimeout(() => {
    const store = useNodeEditorStore.getState();
    for (const n of store.nodes) store.evaluateNode(n.id);
  }, 50);

  say("success", "ai", `Build Logic applied ${nodes.length} node(s), ${edges.length} connection(s) (${opts.mode})`);
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    problems,
    connectivity,
    verify,
    model: data.model,
  };
}
