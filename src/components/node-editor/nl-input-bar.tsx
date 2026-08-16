"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, Replace, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { useNodeEditorStore } from "./use-node-editor-store";
import { buildNodeSchema, materializeNlGraph } from "@/lib/nl-apply";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Natural-language flow builder bar (sits above the workspace). Sends the
// sentence + the node-type catalog to the local Ollama via the backend,
// validates the proposal in nl-apply.ts, and applies it to the board.
export default function NlInputBar() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  // replace = start a fresh board from the request; add = extend current one
  const [mode, setMode] = useState<"replace" | "add">("replace");

  const build = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/nl-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, schema: buildNodeSchema() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || data.detail || `HTTP ${res.status}`);

      const { nodes, edges, problems } = materializeNlGraph(data.graph);
      if (nodes.length === 0) throw new Error("The model produced no valid nodes.");

      const store = useNodeEditorStore.getState();
      if (mode === "replace") {
        useNodeEditorStore.setState({ nodes, edges, dataTriggerState: {} });
      } else {
        useNodeEditorStore.setState((s) => ({ nodes: [...s.nodes, ...nodes], edges: [...s.edges, ...edges] }));
      }
      // Same post-load pass loadFromFile does: evaluate everything once so
      // ports/edges show live values immediately.
      setTimeout(() => {
        for (const n of useNodeEditorStore.getState().nodes) store.evaluateNode(n.id);
      }, 50);

      toast.success(`Built ${nodes.length} nodes, ${edges.length} connections`);
      for (const p of problems) toast.warning(p);
      setPrompt("");
    } catch (err: unknown) {
      toast.error(`NL build failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-11 shrink-0 border-b border-zinc-900 bg-zinc-950 flex items-center gap-2 px-3">
      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && build()}
        disabled={busy}
        placeholder='Describe a flow, e.g. "compare a random number to 50 and log whether it is higher"'
        className="flex-1 h-7 text-xs bg-zinc-900/60 border border-zinc-800 rounded px-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-700/60"
      />
      <button
        onClick={() => setMode(mode === "replace" ? "add" : "replace")}
        className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
        title={mode === "replace" ? "Mode: replace board (click to switch to add)" : "Mode: add to board (click to switch to replace)"}
      >
        {mode === "replace" ? <Replace className="w-3.5 h-3.5" /> : <ListPlus className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={build}
        disabled={busy || !prompt.trim()}
        className="h-7 px-3 rounded bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 text-[11px] font-black uppercase tracking-wider disabled:opacity-40 hover:from-amber-400 hover:to-orange-400 transition cursor-pointer flex items-center gap-1.5"
        title="Build the described flow with the local LLM (Ollama)"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        Build
      </button>
    </div>
  );
}
