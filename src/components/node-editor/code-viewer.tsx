"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CodeLine } from "@/lib/codegen";

// Syntax-highlighted code with a debugger gutter: line numbers, breakpoint
// toggles, an active-line highlight for the node currently executing, and the
// values that node just produced shown inline. Rendered line-by-line (rather
// than one shiki HTML blob) precisely so each line can carry that UI.

interface Token {
  content: string;
  color?: string;
}

export interface CodeViewerProps {
  lines: CodeLine[];
  grammar: string;
  /** node currently executing — its lines are highlighted and scrolled to */
  activeNodeId?: string;
  /** node ids with a breakpoint set */
  breakpoints: Record<string, true>;
  onToggleBreakpoint: (nodeId: string) => void;
  /** nodeId -> short summary of the values it produced, shown inline */
  nodeValues: Record<string, string>;
}

export default function CodeViewer({
  lines,
  grammar,
  activeNodeId,
  breakpoints,
  onToggleBreakpoint,
  nodeValues,
}: CodeViewerProps) {
  const [tokenLines, setTokenLines] = useState<Token[][] | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const code = useMemo(() => lines.map((l) => l.text).join("\n"), [lines]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        // codeToTokens (not codeToHtml) so we own the per-line markup.
        const { codeToTokens } = await import("shiki");
        const res = await codeToTokens(code, { lang: grammar as never, theme: "vitesse-dark" });
        setTokenLines(res.tokens.map((line) => line.map((t) => ({ content: t.content, color: t.color }))));
      } catch {
        // Highlighting is cosmetic — fall back to plain text rather than
        // hiding the code if a grammar fails to load.
        setTokenLines(code.split("\n").map((l): Token[] => [{ content: l }]));
      }
    }, 200);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [code, grammar]);

  // Follow execution: keep the running node's line in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeNodeId]);

  const rendered = tokenLines ?? code.split("\n").map((l): Token[] => [{ content: l }]);
  // Precomputed rather than tracked with a mutable flag during render: the
  // value chip and the scroll anchor attach only to the node's first line.
  const firstActiveLine = activeNodeId ? lines.findIndex((l) => l.nodeId === activeNodeId) : -1;

  return (
    <div className="flex-1 overflow-auto scrollbar-thin font-mono text-[11px] leading-[1.55]">
      {rendered.map((tokens, i) => {
        const nodeId = lines[i]?.nodeId;
        const isActive = !!nodeId && nodeId === activeNodeId;
        const hasBreakpoint = !!nodeId && !!breakpoints[nodeId];
        const isFirstActive = i === firstActiveLine;

        return (
          <div
            key={i}
            ref={isFirstActive ? activeRef : undefined}
            className={`group flex items-start ${
              isActive ? "bg-amber-500/15 border-l-2 border-amber-400" : "border-l-2 border-transparent"
            }`}
          >
            {/* Gutter: breakpoint toggle + line number. Only lines that map to
                a node can hold a breakpoint. */}
            <button
              onClick={() => nodeId && onToggleBreakpoint(nodeId)}
              disabled={!nodeId}
              title={
                nodeId
                  ? hasBreakpoint
                    ? "Remove breakpoint"
                    : "Set breakpoint — the run pauses before this node"
                  : undefined
              }
              className={`w-4 shrink-0 flex items-center justify-center self-stretch ${
                nodeId ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full transition ${
                  hasBreakpoint
                    ? "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.7)]"
                    : nodeId
                      ? "bg-transparent group-hover:bg-red-500/40"
                      : "bg-transparent"
                }`}
              />
            </button>
            <span className="w-8 shrink-0 pr-2 text-right text-zinc-700 select-none tabular-nums">{i + 1}</span>

            <pre className="flex-1 whitespace-pre-wrap break-words pr-2">
              {tokens.map((t, j) => (
                <span key={j} style={t.color ? { color: t.color } : undefined}>
                  {t.content}
                </span>
              ))}
              {/* Values this node just produced, pinned to its first line. */}
              {isFirstActive && nodeId && nodeValues[nodeId] && (
                <span className="ml-2 rounded bg-emerald-950/70 border border-emerald-900/70 px-1.5 py-px text-[9px] font-bold text-emerald-300">
                  {nodeValues[nodeId]}
                </span>
              )}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
