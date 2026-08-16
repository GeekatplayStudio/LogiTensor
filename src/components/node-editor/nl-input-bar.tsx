"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, Replace, ListPlus, Terminal } from "lucide-react";
import { toast } from "sonner";
import { useNodeEditorStore } from "./use-node-editor-store";
import { buildNodeSchema, materializeNlGraph } from "@/lib/nl-apply";
import AiActivityLog, { type ActivityEntry } from "./ai-activity-log";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Natural-language flow builder bar (sits above the workspace). Sends the
// sentence + the node-type catalog to the local Ollama via the backend,
// validates the proposal in nl-apply.ts, and applies it to the board — with
// every step narrated in the activity overlay so a bad build is diagnosable.
export default function NlInputBar() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  // replace = start a fresh board from the request; add = extend current one
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [log, setLog] = useState<ActivityEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);

  // Discover installed Ollama models so the picker defaults to the most
  // capable one rather than a hardcoded name that may not be installed.
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
        /* offline backend is reported when Build is pressed */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const say = (kind: ActivityEntry["kind"], label: string, detail?: string) =>
    setLog((prev) => [...prev, { kind, label, detail, at: Date.now() }]);

  const build = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setLog([]);
    setLogOpen(true);
    setLogCollapsed(false);

    try {
      const schema = buildNodeSchema();
      say("info", `Using model: ${model || "auto (most capable installed)"}`);
      say("send", `Sending request with catalog of ${schema.length} node types`, text);

      const started = Date.now();
      const res = await fetch(`${API_URL}/nl-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, schema, model }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        say("error", data.error || data.detail || `HTTP ${res.status}`, data.raw);
        throw new Error(data.error || data.detail || `HTTP ${res.status}`);
      }

      say("recv", `Model replied in ${((Date.now() - started) / 1000).toFixed(1)}s`, data.raw);

      const { nodes, edges, problems, connectivity } = materializeNlGraph(data.graph);
      say(
        problems.length ? "warn" : "ok",
        `Validated: ${nodes.length} nodes, ${edges.length} connections accepted` +
          (problems.length ? `, ${problems.length} rejected` : ""),
        problems.length ? problems.join("\n") : undefined
      );

      if (nodes.length === 0) throw new Error("The model produced no valid nodes.");

      if (connectivity.length) {
        say("warn", `Wiring check found ${connectivity.length} issue(s)`, connectivity.join("\n"));
      } else {
        say("ok", "Wiring check passed — every node is connected and reachable");
      }

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

      say("ok", `Applied to canvas (${mode === "replace" ? "replaced board" : "added to board"})`);
      toast.success(`Built ${nodes.length} nodes, ${edges.length} connections`);
      setPrompt("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      say("error", `Build failed: ${msg}`);
      toast.error(`NL build failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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

        {models.length > 0 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy}
            className="h-7 max-w-[150px] text-[10px] bg-zinc-900/60 border border-zinc-800 rounded px-1.5 text-zinc-300 focus:outline-none focus:border-amber-700/60 cursor-pointer"
            title="Which local Ollama model builds the graph. Larger coder/reasoning models follow the wiring rules far more reliably."
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => setLogOpen((v) => !v)}
          className={`p-1.5 rounded transition cursor-pointer ${logOpen ? "text-amber-400 bg-zinc-800" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"}`}
          title="Show what the AI is doing (requests, replies, validation)"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
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

      <AiActivityLog
        entries={log}
        open={logOpen && log.length > 0}
        collapsed={logCollapsed}
        onToggleCollapsed={() => setLogCollapsed((v) => !v)}
        onClose={() => setLogOpen(false)}
      />
    </>
  );
}
