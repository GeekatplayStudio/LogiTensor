"use client";

import React, { useEffect, useRef } from "react";
import { X, ChevronDown, ChevronUp, Terminal } from "lucide-react";

export type ActivityKind = "info" | "send" | "recv" | "ok" | "warn" | "error";

export interface ActivityEntry {
  kind: ActivityKind;
  label: string;
  /** optional payload shown in a monospace block (prompt, raw JSON, …) */
  detail?: string;
  at: number;
}

const KIND_STYLE: Record<ActivityKind, { dot: string; text: string }> = {
  info: { dot: "bg-zinc-500", text: "text-zinc-400" },
  send: { dot: "bg-sky-400", text: "text-sky-300" },
  recv: { dot: "bg-violet-400", text: "text-violet-300" },
  ok: { dot: "bg-emerald-400", text: "text-emerald-300" },
  warn: { dot: "bg-amber-400", text: "text-amber-300" },
  error: { dot: "bg-red-400", text: "text-red-300" },
};

/**
 * Bottom overlay that narrates an AI graph build: which model was chosen,
 * what was sent, what came back verbatim, what validation rejected, and the
 * final wiring audit. Previously a failed build just showed a toast, so
 * there was no way to see *why* the produced graph was wrong.
 */
export default function AiActivityLog({
  entries,
  open,
  collapsed,
  onToggleCollapsed,
  onClose,
}: {
  entries: ActivityEntry[];
  open: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view as the build progresses.
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  if (!open) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 mx-3 mb-3 rounded-lg border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="h-8 flex items-center gap-2 px-2.5 border-b border-zinc-900 bg-zinc-900/40">
        <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">AI Build Activity</span>
        <span className="text-[9px] text-zinc-600">{entries.length} events</span>
        <div className="flex-1" />
        <button
          onClick={onToggleCollapsed}
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition cursor-pointer"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div ref={scrollRef} className="max-h-56 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {entries.map((e, i) => {
            const style = KIND_STYLE[e.kind];
            return (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[11px] ${style.text}`}>{e.label}</span>
                    <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                      {new Date(e.at).toLocaleTimeString()}
                    </span>
                  </div>
                  {e.detail && (
                    <pre className="mt-0.5 max-h-28 overflow-auto scrollbar-thin whitespace-pre-wrap break-all rounded bg-zinc-900/70 border border-zinc-900 px-2 py-1 font-mono text-[9px] leading-relaxed text-zinc-400">
                      {e.detail}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
