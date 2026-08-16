import type { Edge, Node } from "@xyflow/react";
import type { NodeData, PortDefinition } from "@/types/nodes";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { generateCode } from "@/lib/codegen";
import type { LogEntry } from "@/lib/debug-log";

/**
 * Run Report — a single self-contained diagnostic bundle describing what the
 * engine actually executed, and (more usefully) what it did NOT.
 *
 * Everything here except `downloadRunReport` is pure: the caller passes the
 * pieces of store state it needs, so the module never imports the Zustand
 * store and stays trivially unit-testable.
 */

export interface LastRunInfo {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  success: boolean;
  error?: string;
  loops: number;
  /** node ids in execution order; may repeat across loops */
  trace: string[];
  backendLogs: string[];
  outputs: Record<string, Record<string, unknown>>;
}

export interface RunReportInput {
  nodes: Node<NodeData>[];
  edges: Edge[];
  lastRun?: LastRunInfo;
  /** codegen target for the embedded source listing */
  target?: string;
  /** app-wide debug log slice (caller reads it via getLogEntries()) */
  debugLog?: LogEntry[];
}

export interface TraceStep {
  step: number;
  nodeId: string;
  type: string;
  label: string;
}

export interface UnexecutedNode {
  nodeId: string;
  type: string;
  label: string;
  reason: string;
}

export interface NodeInstanceSummary {
  nodeId: string;
  label: string;
  executions: number;
  incomingTriggerEdges: number;
  incomingDataEdges: number;
  outgoingEdges: number;
}

export interface DuplicateTypeGroup {
  type: string;
  instances: NodeInstanceSummary[];
}

export interface EdgeSummary {
  edgeId: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface NodeDetail {
  nodeId: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  outputs: Record<string, unknown>;
  executionState: string;
  errorMessage?: string;
  incoming: EdgeSummary[];
  outgoing: EdgeSummary[];
  executions: number;
  traceEligible: boolean;
}

export interface RunReport {
  generatedAt: number;
  nodeCount: number;
  edgeCount: number;
  lastRun?: LastRunInfo;
  trace: TraceStep[];
  neverExecuted: UnexecutedNode[];
  duplicateTypes: DuplicateTypeGroup[];
  nodeDetails: NodeDetail[];
  generatedCode: { target: string; code: string; warnings: string[] };
  flowJson: string;
  backendLogs: string[];
  debugLog: LogEntry[];
}

/** Max debug-log entries embedded in the report (newest kept). */
const DEBUG_LOG_LIMIT = 200;

function portsOf(node: Node<NodeData>, side: "inputs" | "outputs"): PortDefinition[] {
  const fromData = node.data?.[side];
  if (Array.isArray(fromData) && fromData.length > 0) return fromData as PortDefinition[];
  return (NODE_DEFINITIONS[node.data?.type ?? node.type ?? ""]?.[side] ?? []) as PortDefinition[];
}

/**
 * "Would this node ever appear in a backend trace?"
 *
 * The backend keeps its own ACTIVE_TYPES set (backend/engine/state.py), but we
 * must not import across the Python boundary — and duplicating that literal
 * list would rot. Instead we derive the same distinction from the node
 * definition: the backend's trace records nodes the trigger flow *visits*, and
 * a node can only be visited if it has a trigger input port (or is the Manual
 * Trigger itself, which starts the flow). Pure data/passive nodes are folded
 * into whichever active node reads them, so they never show up in a trace by
 * design — absence there is expected, not a fault.
 */
export function isTraceEligible(node: Node<NodeData>): boolean {
  const type = node.data?.type ?? node.type ?? "";
  if (type === "triggerInput") return true;
  return portsOf(node, "inputs").some((p) => p.type === "trigger");
}

function isTriggerPort(node: Node<NodeData> | undefined, side: "inputs" | "outputs", portId?: string | null): boolean {
  if (!node || !portId) return false;
  return portsOf(node, side).some((p) => p.id === portId && p.type === "trigger");
}

/** Nodes reachable from any Manual Trigger by following trigger-typed edges. */
function reachableFromManualTrigger(nodes: Node<NodeData>[], edges: Edge[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const queue = nodes.filter((n) => (n.data?.type ?? n.type) === "triggerInput").map((n) => n.id);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const e of edges) {
      if (e.source !== current) continue;
      // Only trigger wires propagate execution flow.
      if (!isTriggerPort(byId.get(e.source), "outputs", e.sourceHandle)) continue;
      if (seen.has(e.target)) continue;
      seen.add(e.target);
      queue.push(e.target);
    }
  }
  return seen;
}

function summarizeEdge(e: Edge): EdgeSummary {
  return {
    edgeId: e.id,
    from: e.source,
    fromPort: e.sourceHandle ?? "",
    to: e.target,
    toPort: e.targetHandle ?? "",
  };
}

export function buildRunReport(input: RunReportInput): RunReport {
  const { nodes, edges, lastRun } = input;
  const target = input.target ?? "python";
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trace = lastRun?.trace ?? [];

  const executions = new Map<string, number>();
  for (const id of trace) executions.set(id, (executions.get(id) ?? 0) + 1);

  const reachable = reachableFromManualTrigger(nodes, edges);

  const traceSteps: TraceStep[] = trace.map((nodeId, i) => {
    const n = byId.get(nodeId);
    return {
      step: i + 1,
      nodeId,
      type: (n?.data?.type ?? n?.type ?? "unknown") as string,
      label: (n?.data?.label ?? nodeId) as string,
    };
  });

  const neverExecuted: UnexecutedNode[] = [];
  const nodeDetails: NodeDetail[] = [];

  for (const node of nodes) {
    const type = (node.data?.type ?? node.type ?? "unknown") as string;
    const label = (node.data?.label ?? node.id) as string;
    const incoming = edges.filter((e) => e.target === node.id);
    const outgoing = edges.filter((e) => e.source === node.id);
    const count = executions.get(node.id) ?? 0;
    const eligible = isTraceEligible(node);

    const outputs: Record<string, unknown> = {};
    for (const p of portsOf(node, "outputs")) outputs[p.id] = p.value;

    nodeDetails.push({
      nodeId: node.id,
      type,
      label,
      config: (node.data?.config ?? {}) as Record<string, unknown>,
      outputs,
      executionState: (node.data?.executionState ?? "idle") as string,
      ...(node.data?.errorMessage ? { errorMessage: node.data.errorMessage as string } : {}),
      incoming: incoming.map(summarizeEdge),
      outgoing: outgoing.map(summarizeEdge),
      executions: count,
      traceEligible: eligible,
    });

    if (count > 0) continue;

    const hasIncomingTrigger = incoming.some((e) => isTriggerPort(node, "inputs", e.targetHandle));
    let reason: string;
    if (!eligible) {
      reason =
        "Passive/data node — it has no trigger input, so the backend folds it into its consumer and it never appears in a trace by design.";
    } else if (type === "triggerInput") {
      reason = "Manual Trigger was not fired during this run.";
    } else if (!hasIncomingTrigger) {
      reason =
        "No trigger edge is wired into any of its trigger input ports — nothing can ever start it.";
    } else if (!reachable.has(node.id)) {
      reason =
        "Wired to a trigger, but that chain is not reachable from any Manual Trigger node.";
    } else {
      reason =
        "Reachable and trigger-wired, but not reached this run — an upstream branch/condition likely skipped it, or the run failed first.";
    }
    neverExecuted.push({ nodeId: node.id, type, label, reason });
  }

  const byType = new Map<string, NodeDetail[]>();
  for (const d of nodeDetails) {
    const list = byType.get(d.type);
    if (list) list.push(d);
    else byType.set(d.type, [d]);
  }
  const duplicateTypes: DuplicateTypeGroup[] = [];
  for (const [type, list] of byType) {
    if (list.length < 2) continue;
    duplicateTypes.push({
      type,
      instances: list.map((d) => {
        const node = byId.get(d.nodeId);
        return {
          nodeId: d.nodeId,
          label: d.label,
          executions: d.executions,
          incomingTriggerEdges: d.incoming.filter((e) => isTriggerPort(node, "inputs", e.toPort)).length,
          incomingDataEdges: d.incoming.filter((e) => !isTriggerPort(node, "inputs", e.toPort)).length,
          outgoingEdges: d.outgoing.length,
        };
      }),
    });
  }

  let generatedCode = { target, code: "", warnings: [] as string[] };
  try {
    const gen = generateCode(nodes, edges, target);
    generatedCode = { target, code: gen.code, warnings: gen.warnings };
  } catch (err) {
    generatedCode = {
      target,
      code: "",
      warnings: [`Code generation threw: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const debugLog = (input.debugLog ?? []).slice(-DEBUG_LOG_LIMIT);

  return {
    generatedAt: Date.now(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    ...(lastRun ? { lastRun } : {}),
    trace: traceSteps,
    neverExecuted,
    duplicateTypes,
    nodeDetails,
    generatedCode,
    flowJson: JSON.stringify({ nodes, edges }, null, 2),
    backendLogs: lastRun?.backendLogs ?? [],
    debugLog,
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function fence(body: string, lang = ""): string {
  return "```" + lang + "\n" + (body.endsWith("\n") ? body : body + "\n") + "```";
}

export function formatRunReportMarkdown(report: RunReport): string {
  const out: string[] = [];
  const r = report;

  out.push("# LogiBoard Run Report");
  out.push("");
  out.push(`- Generated: ${iso(r.generatedAt)}`);
  out.push(`- Graph: ${r.nodeCount} node(s), ${r.edgeCount} edge(s)`);
  if (r.lastRun) {
    out.push(`- Run started: ${iso(r.lastRun.startedAt)}`);
    out.push(`- Run finished: ${iso(r.lastRun.finishedAt)}`);
    out.push(`- Duration: ${r.lastRun.durationMs} ms`);
    out.push(`- Loops: ${r.lastRun.loops}`);
    out.push(`- Result: ${r.lastRun.success ? "SUCCESS" : "FAILURE"}`);
    if (r.lastRun.error) out.push(`- Error: ${r.lastRun.error}`);
  } else {
    out.push("- Result: **no run has been executed in this session yet** — the");
    out.push("  execution trace, backend logs and per-node outputs below are empty.");
  }
  out.push("");

  out.push("## Execution trace");
  out.push("");
  if (r.trace.length === 0) {
    out.push("_No trace recorded._");
  } else {
    out.push("| # | node id | type | label |");
    out.push("| --- | --- | --- | --- |");
    for (const s of r.trace) out.push(`| ${s.step} | ${s.nodeId} | ${s.type} | ${s.label} |`);
  }
  out.push("");

  out.push("## Declared but never executed");
  out.push("");
  if (r.neverExecuted.length === 0) {
    out.push("_Every node in the graph appeared in the trace._");
  } else {
    for (const n of r.neverExecuted) {
      out.push(`- **${n.label}** (\`${n.nodeId}\`, type \`${n.type}\`) — ${n.reason}`);
    }
  }
  out.push("");

  out.push("## Duplicate node types");
  out.push("");
  if (r.duplicateTypes.length === 0) {
    out.push("_No node type appears more than once._");
  } else {
    for (const g of r.duplicateTypes) {
      out.push(`### ${g.type} (${g.instances.length} instances)`);
      out.push("");
      out.push("| node id | label | executions | trigger-in | data-in | out |");
      out.push("| --- | --- | --- | --- | --- | --- |");
      for (const i of g.instances) {
        out.push(
          `| ${i.nodeId} | ${i.label} | ${i.executions} | ${i.incomingTriggerEdges} | ${i.incomingDataEdges} | ${i.outgoingEdges} |`
        );
      }
      out.push("");
    }
  }
  out.push("");

  out.push("## Per-node detail");
  out.push("");
  for (const d of r.nodeDetails) {
    out.push(`### ${d.label} — \`${d.nodeId}\` (\`${d.type}\`)`);
    out.push("");
    out.push(`- Execution state: ${d.executionState}${d.errorMessage ? ` — ${d.errorMessage}` : ""}`);
    out.push(`- Times in trace: ${d.executions}${d.traceEligible ? "" : " (passive node — never traced)"}`);
    out.push(`- Config: \`${JSON.stringify(d.config)}\``);
    out.push(`- Outputs: \`${JSON.stringify(d.outputs)}\``);
    const inc = d.incoming.map((e) => `${e.from}.${e.fromPort} -> ${e.toPort}`);
    const outg = d.outgoing.map((e) => `${e.fromPort} -> ${e.to}.${e.toPort}`);
    out.push(`- Incoming: ${inc.length > 0 ? inc.join(", ") : "none"}`);
    out.push(`- Outgoing: ${outg.length > 0 ? outg.join(", ") : "none"}`);
    out.push("");
  }

  out.push(`## Generated code (${r.generatedCode.target})`);
  out.push("");
  if (r.generatedCode.warnings.length > 0) {
    out.push("Warnings:");
    for (const w of r.generatedCode.warnings) out.push(`- ${w}`);
    out.push("");
  }
  out.push(fence(r.generatedCode.code || "// (empty)", r.generatedCode.target));
  out.push("");

  out.push("## Flow JSON");
  out.push("");
  out.push(fence(r.flowJson, "json"));
  out.push("");

  out.push("## Backend logs");
  out.push("");
  out.push(r.backendLogs.length > 0 ? fence(r.backendLogs.join("\n")) : "_No backend logs._");
  out.push("");

  out.push(`## App debug log (last ${r.debugLog.length})`);
  out.push("");
  if (r.debugLog.length === 0) {
    out.push("_Empty._");
  } else {
    out.push(
      fence(
        r.debugLog
          .map((e) => `${iso(e.at)} [${e.level}/${e.source}] ${e.message}${e.detail ? ` :: ${e.detail}` : ""}`)
          .join("\n")
      )
    );
  }
  out.push("");

  return out.join("\n");
}

/**
 * Browser-only: saves the markdown report as a file. Mirrors the Blob + anchor
 * dance used by `saveToFile` in persistence-slice.ts.
 */
export function downloadRunReport(report: RunReport): string {
  const markdown = formatRunReportMarkdown(report);
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `logiboard_run_report_${report.generatedAt}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return markdown;
}
