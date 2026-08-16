"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Copy, Check, Code2, Pencil, Undo2, Loader2, ArrowLeftRight, CircleOff } from "lucide-react";
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
import { buildNodeSchema, materializeNlGraph } from "@/lib/nl-apply";
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
  const [target, setTarget] = useState("typescript");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [applying, setApplying] = useState(false);

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

  // Applies hand-edited source back onto the canvas. Parsing eight target
  // languages deterministically isn't feasible, so this reuses the same
  // local-LLM + schema-validation path as the natural-language builder:
  // the model proposes a graph, and nothing reaches the canvas until every
  // node type, port and edge has been checked against NODE_DEFINITIONS.
  const applyToGraph = async () => {
    if (applying || !draft.trim()) return;
    setApplying(true);
    try {
      const res = await fetch(`${API_URL}/nl-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: draft, schema: buildNodeSchema(), mode: "code" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || data.detail || `HTTP ${res.status}`);

      const { nodes: built, edges: builtEdges, problems } = materializeNlGraph(data.graph);
      if (built.length === 0) throw new Error("No valid nodes could be read from this code.");

      useNodeEditorStore.setState({ nodes: built, edges: builtEdges, dataTriggerState: {} });
      setTimeout(() => {
        const store = useNodeEditorStore.getState();
        for (const n of store.nodes) store.evaluateNode(n.id);
      }, 50);

      toast.success(`Applied ${built.length} nodes, ${builtEdges.length} connections`);
      for (const p of problems) toast.warning(p);
      setEditing(false);
    } catch (err: unknown) {
      toast.error(`Apply failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplying(false);
    }
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
            <button
              onClick={applyToGraph}
              disabled={applying}
              className="h-7 px-2 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 transition cursor-pointer flex items-center gap-1"
              title="Rebuild the canvas from this code (local LLM, validated against the node catalog)"
            >
              {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeftRight className="w-3 h-3" />}
              Apply
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
            ✎ Editing — the panel has stopped following the canvas. Apply rebuilds the graph from this code.
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
