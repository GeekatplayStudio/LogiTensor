"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Check,
  Code2,
  Pencil,
  Undo2,
  Loader2,
  Hammer,
  CircleOff,
  Replace,
  ListPlus,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNodeEditorStore } from "./use-node-editor-store";
import { generateCode, CODE_TARGETS } from "@/lib/codegen";
import { generateTestFile } from "@/lib/codegen/testgen";
import { buildLogicFromCode } from "@/lib/code-import";
import { verifyGraph } from "@/lib/graph-verify";
import { logEvent } from "@/lib/debug-log";
import CodeViewer from "./code-viewer";

/** Compact one-line rendering of a port value for the inline value chip. */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  const s = String(v);
  return s.length > 18 ? `${s.slice(0, 15)}…` : s;
}

const TARGET_STORAGE_KEY = "logitensor-code-target";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Live source-code view of the canvas graph (right panel). Regenerates on a
// debounce whenever nodes/edges change, so loading a saved flow repopulates
// it automatically. Switching to Edit mode detaches it so hand-written code
// can be applied back onto the graph.
export default function CodePanel() {
  const nodes = useNodeEditorStore((s) => s.nodes);
  const edges = useNodeEditorStore((s) => s.edges);
  const breakpoints = useNodeEditorStore((s) => s.breakpoints);
  const toggleBreakpoint = useNodeEditorStore((s) => s.toggleBreakpoint);
  const clearBreakpoints = useNodeEditorStore((s) => s.clearBreakpoints);
  const setTestPanel = useNodeEditorStore((s) => s.setTestPanel);
  const [target, setTarget] = useState("typescript");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [applying, setApplying] = useState(false);
  // Build Logic options: replace vs add, and which local model analyzes the code.
  const [buildMode, setBuildMode] = useState<"replace" | "add">("replace");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");

  // The node the engine is executing right now drives the active-line
  // highlight; its freshly-computed outputs are shown beside that line.
  const activeNodeId = nodes.find((n) => n.data.executionState === "running")?.id;
  const nodeValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const n of nodes) {
      const parts = n.data.outputs
        .filter((o) => o.type === "data" && o.value !== undefined)
        .map((o) => `${o.name}=${formatValue(o.value)}`);
      if (parts.length) out[n.id] = parts.join("  ");
    }
    return out;
  }, [nodes]);

  // Persisted target choice — restored once after mount. Deferred via
  // timeout so hydration renders the same default the server did (no
  // mismatch) and the effect doesn't set state synchronously.
  useEffect(() => {
    const id = setTimeout(() => {
      const saved = localStorage.getItem(TARGET_STORAGE_KEY);
      if (saved && CODE_TARGETS.some((t) => t.id === saved)) setTarget(saved);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // Ollama model list for Build Logic — same discovery the NL bar does, so
  // the code path is no longer stuck on the backend's default model.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/models`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setModels(d.models ?? []);
        setModel(d.default ?? "");
      })
      .catch(() => {
        /* offline backend is reported when Build Logic is pressed */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => generateCode(nodes, edges, target), [nodes, edges, target]);
  const grammar = CODE_TARGETS.find((t) => t.id === target)?.grammar ?? "typescript";

  const copy = async () => {
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    toast.success("Code copied");
    setTimeout(() => setCopied(false), 1200);
  };

  const startEditing = () => {
    setDraft(result.code);
    setEditing(true);
  };

  // Build Logic: analyzes pasted/edited source with the local LLM, validates
  // the proposal against NODE_DEFINITIONS, dry-runs every passive node and
  // checks the regenerated code before it lands on the canvas — the whole
  // pipeline lives in src/lib/code-import.ts, shared with tests.
  const buildLogic = async () => {
    if (applying || !draft.trim()) return;
    setApplying(true);
    try {
      const outcome = await buildLogicFromCode(draft, { mode: buildMode, model });
      toast.success(
        `Built ${outcome.nodeCount} nodes, ${outcome.edgeCount} connections — ${outcome.verify.summary}`
      );
      for (const p of outcome.problems) toast.warning(p);
      for (const c of outcome.connectivity) toast.warning(c);
      for (const f of outcome.verify.findings.filter((f) => f.level === "error")) {
        toast.error(`${f.label}: ${f.message}`);
      }
      setEditing(false);
    } catch (err: unknown) {
      toast.error(`Build Logic failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplying(false);
    }
  };

  // On-demand verification of the current board: wiring, per-node dry-run,
  // codegen warnings. Full findings go to the terminal; toast the verdict.
  const verifyBoard = () => {
    const report = verifyGraph(nodes, edges);
    logEvent(
      report.errors ? "error" : report.warnings ? "warn" : "success",
      "ai",
      `Board verification: ${report.summary}`,
      report.findings.map((f) => `[${f.level}] ${f.label}: ${f.message}`).join("\n") || undefined
    );
    if (report.errors) toast.error(report.summary);
    else if (report.warnings) toast.warning(`${report.summary} See terminal for details.`);
    else toast.success(report.summary);
  };

  // Generates the vitest/pytest file for the current board and opens the
  // split test pane below this panel.
  const makeTests = () => {
    const t = generateTestFile(nodes, edges, target);
    setTestPanel({ code: t.code, lines: t.lines, grammar: t.grammar, target: t.target });
    toast.success(
      `Generated ${t.target === "python" ? "pytest" : "vitest"} tests` +
        (t.skipped.length ? ` (${t.skipped.length} node(s) not covered — see file footer)` : "")
    );
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-900">
      <div className="h-10 shrink-0 flex items-center gap-2 px-2.5 border-b border-zinc-900">
        <Code2 className={`w-3.5 h-3.5 shrink-0 ${editing ? "text-amber-400" : "text-emerald-400"}`} />
        <Select
          value={target}
          onValueChange={(v) => {
            if (!v) return; // base-ui Select reports null on clear
            setTarget(v);
            localStorage.setItem(TARGET_STORAGE_KEY, v);
          }}
        >
          <SelectTrigger className="h-7 flex-1 text-xs bg-zinc-900/60 border-zinc-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
            {CODE_TARGETS.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {editing ? (
          <>
            {models.length > 0 && (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={applying}
                className="h-7 max-w-[110px] text-[10px] bg-zinc-900/60 border border-zinc-800 rounded px-1 text-zinc-300 focus:outline-none focus:border-amber-700/60 cursor-pointer"
                title="Which local Ollama model analyzes the code. Larger coder models map logic far more faithfully."
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setBuildMode(buildMode === "replace" ? "add" : "replace")}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              title={buildMode === "replace" ? "Mode: replace board (click to switch to add)" : "Mode: add to board (click to switch to replace)"}
            >
              {buildMode === "replace" ? <Replace className="w-3.5 h-3.5" /> : <ListPlus className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={buildLogic}
              disabled={applying}
              className="h-7 px-2 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 transition cursor-pointer flex items-center gap-1"
              title="Analyze this code and rebuild it as a node flow (local LLM, validated against the node catalog, every node dry-run verified)"
            >
              {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />}
              Build Logic
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              title="Discard edits and follow the canvas again"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={verifyBoard}
              className="p-1.5 rounded text-zinc-500 hover:text-emerald-300 hover:bg-zinc-800 transition cursor-pointer"
              title="Verify the board: wiring audit, dry-run of every node's logic, generated-code check"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={makeTests}
              className="p-1.5 rounded text-zinc-500 hover:text-violet-300 hover:bg-zinc-800 transition cursor-pointer"
              title={`Generate a ${target === "python" ? "pytest" : "vitest"} test file for this board (opens below)`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
            </button>
            {Object.keys(breakpoints).length > 0 && (
              <button
                onClick={clearBreakpoints}
                className="p-1.5 rounded text-red-400/80 hover:text-red-300 hover:bg-zinc-800 transition cursor-pointer"
                title={`Clear ${Object.keys(breakpoints).length} breakpoint(s)`}
              >
                <CircleOff className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={startEditing}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              title="Edit this code by hand, then apply it back to the canvas"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={copy}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              title="Copy code to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </>
        )}
      </div>

      {editing && (
        <div className="shrink-0 px-2.5 py-1.5 border-b border-zinc-900 bg-amber-950/20">
          <p className="text-[9px] text-amber-500/90 leading-tight">
            ✎ Editing — paste or write any code here. Build Logic analyzes it and rebuilds it as a verified node flow.
          </p>
        </div>
      )}

      {!editing && result.warnings.length > 0 && (
        <div className="shrink-0 px-2.5 py-1.5 border-b border-zinc-900 bg-amber-950/20">
          {result.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="text-[9px] text-amber-500/90 leading-tight truncate" title={w}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full resize-none bg-zinc-950 text-zinc-200 font-mono text-[11px] leading-relaxed p-3 outline-none scrollbar-thin"
        />
      ) : (
        <CodeViewer
          lines={result.lines}
          grammar={grammar}
          activeNodeId={activeNodeId}
          breakpoints={breakpoints}
          onToggleBreakpoint={toggleBreakpoint}
          nodeValues={nodeValues}
        />
      )}
    </div>
  );
}
