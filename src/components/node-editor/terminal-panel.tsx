"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Search,
  Terminal,
  Trash2,
} from "lucide-react";
import { clearLog, useDebugLog, type LogEntry, type LogLevel } from "@/lib/debug-log";

/** Per-level palette — matches the app's zinc/accent dark theme. */
const LEVEL_STYLE: Record<LogLevel, { text: string; badge: string; dot: string }> = {
  debug: { text: "text-zinc-400", badge: "bg-zinc-800 text-zinc-400 border-zinc-700", dot: "bg-zinc-500" },
  info: { text: "text-sky-300", badge: "bg-sky-950 text-sky-300 border-sky-900", dot: "bg-sky-400" },
  success: { text: "text-emerald-300", badge: "bg-emerald-950 text-emerald-300 border-emerald-900", dot: "bg-emerald-400" },
  warn: { text: "text-amber-300", badge: "bg-amber-950 text-amber-300 border-amber-900", dot: "bg-amber-400" },
  error: { text: "text-red-300", badge: "bg-red-950 text-red-300 border-red-900", dot: "bg-red-400" },
};

const LEVELS: LogLevel[] = ["debug", "info", "success", "warn", "error"];

function timeOf(at: number): string {
  const d = new Date(at);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLE[entry.level];
  const hasDetail = !!entry.detail;

  return (
    <div className="px-2 py-[2px] hover:bg-zinc-900/60 rounded-sm">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono text-zinc-600 shrink-0 tabular-nums pt-[1px]">
          {timeOf(entry.at)}
        </span>
        <span
          className={`text-[9px] uppercase font-bold px-1 rounded border shrink-0 ${style.badge}`}
          title={`${entry.level} · ${entry.source}`}
        >
          {entry.source}
        </span>
        <button
          type="button"
          onClick={() => hasDetail && setOpen((v) => !v)}
          className={`min-w-0 flex-1 text-left text-[11px] font-mono leading-relaxed break-words ${style.text} ${
            hasDetail ? "cursor-pointer" : "cursor-default"
          }`}
          title={hasDetail ? (open ? "Hide detail" : "Show detail") : undefined}
        >
          {hasDetail && (
            <span className="inline-block align-middle text-zinc-600 mr-0.5">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          )}
          {entry.message}
        </button>
      </div>
      {hasDetail && open && (
        <pre className="ml-[4.5rem] mt-0.5 max-h-40 overflow-auto scrollbar-thin whitespace-pre-wrap break-all rounded bg-zinc-900/70 border border-zinc-800 px-2 py-1 font-mono text-[10px] leading-relaxed text-zinc-400">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

/**
 * VS Code-style output terminal: every instrumented event in the app (graph
 * edits, execution hops, backend logs, file IO, AI builds) lands here, so a
 * silent failure can always be traced after the fact instead of guessing from
 * a toast that already vanished.
 */
export default function TerminalPanel() {
  const entries = useDebugLog();
  const [hidden, setHidden] = useState<Set<LogLevel>>(() => new Set());
  const [query, setQuery] = useState("");
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (hidden.has(e.level)) return false;
      if (!q) return true;
      return (
        e.message.toLowerCase().includes(q) ||
        e.source.includes(q) ||
        (e.detail ? e.detail.toLowerCase().includes(q) : false)
      );
    });
  }, [entries, hidden, query]);

  // Follow the newest line while autoscroll is on.
  useEffect(() => {
    if (autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoscroll]);

  // Scrolling up by hand means the user is reading history — stop yanking them
  // back down until they return to the bottom (or re-enable it explicitly).
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoscroll(atBottom);
  };

  const toggleLevel = (level: LogLevel) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-300 min-h-0">
      <div className="h-8 shrink-0 flex items-center gap-2 px-2 border-b border-zinc-800 bg-zinc-900/40">
        <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Terminal</span>
        <span className="text-[10px] text-zinc-600 tabular-nums" title="Shown / total entries">
          {filtered.length}/{entries.length}
        </span>

        <div className="flex items-center gap-1 ml-1">
          {LEVELS.map((level) => {
            const on = !hidden.has(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                title={`${on ? "Hide" : "Show"} ${level} entries`}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition cursor-pointer ${
                  on
                    ? LEVEL_STYLE[level].badge
                    : "bg-transparent text-zinc-600 border-zinc-800 hover:text-zinc-400"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${on ? LEVEL_STYLE[level].dot : "bg-zinc-700"}`} />
                {level}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="w-3 h-3 text-zinc-600 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            title="Filter by message, source or detail"
            className="w-36 h-6 pl-6 pr-2 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-700"
          />
        </div>

        <button
          type="button"
          onClick={() => setAutoscroll((v) => !v)}
          title={autoscroll ? "Autoscroll on — click to pin position" : "Autoscroll off — click to follow newest"}
          className={`p-1 rounded transition cursor-pointer ${
            autoscroll ? "text-emerald-400 bg-zinc-800/70" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={clearLog}
          title="Clear terminal"
          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin py-1 font-mono"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-zinc-600">
            {entries.length === 0 ? "No output yet — interact with the board." : "No entries match the current filters."}
          </div>
        ) : (
          filtered.map((e) => <LogRow key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}
