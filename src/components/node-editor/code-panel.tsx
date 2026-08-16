"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, Code2 } from "lucide-react";
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

const TARGET_STORAGE_KEY = "logitensor-code-target";

// Live source-code view of the canvas graph (right panel). Regenerates on a
// debounce whenever nodes/edges change; shiki highlights the result.
export default function CodePanel() {
  const nodes = useNodeEditorStore((s) => s.nodes);
  const edges = useNodeEditorStore((s) => s.edges);
  const [target, setTarget] = useState("typescript");
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    // Debounced highlight: shiki is imported dynamically so its grammars stay
    // out of the initial bundle, and rapid node drags don't re-highlight.
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const grammar = CODE_TARGETS.find((t) => t.id === target)?.grammar ?? "typescript";
      try {
        const { codeToHtml } = await import("shiki");
        setHtml(await codeToHtml(result.code, { lang: grammar, theme: "vitesse-dark" }));
      } catch {
        // Highlighting is cosmetic — fall back to plain text rather than
        // hiding the code if a grammar fails to load.
        setHtml(`<pre>${result.code.replace(/</g, "&lt;")}</pre>`);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [result.code, target]);

  const copy = async () => {
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    toast.success("Code copied");
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-900">
      <div className="h-10 shrink-0 flex items-center gap-2 px-2.5 border-b border-zinc-900">
        <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
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
        <button
          onClick={copy}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
          title="Copy code to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {result.warnings.length > 0 && (
        <div className="shrink-0 px-2.5 py-1.5 border-b border-zinc-900 bg-amber-950/20">
          {result.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="text-[9px] text-amber-500/90 leading-tight truncate" title={w}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
      <div
        className="flex-1 overflow-auto scrollbar-thin text-[11px] leading-relaxed [&_pre]:p-3 [&_pre]:min-h-full [&_pre]:!bg-transparent font-mono"
        // shiki output is generated locally from our own code string — not
        // user-controlled HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
