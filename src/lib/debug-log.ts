"use client";

import { useSyncExternalStore } from "react";

/**
 * App-wide debug log. A tiny dependency-free external store that any module —
 * Zustand actions, pure helpers, React components — can write to, and that the
 * Terminal panel subscribes to. Deliberately NOT part of the Zustand store:
 * logging must never trigger a graph-state update or be reachable from a
 * store action's own set() cycle.
 */

export type LogLevel = "debug" | "info" | "success" | "warn" | "error";

export type LogSource =
  | "graph"
  | "exec"
  | "ai"
  | "code"
  | "io"
  | "backend"
  | "system";

export interface LogEntry {
  id: number;
  /** epoch ms */
  at: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  /** optional payload rendered in an expandable monospace block */
  detail?: string;
}

/** Ring-buffer cap: a long editing session must not grow memory unbounded. */
export const MAX_LOG_ENTRIES = 1000;

// The snapshot must be a STABLE reference between writes — useSyncExternalStore
// calls getSnapshot on every render and loops forever if it sees a new array
// each time. So we replace the array only inside logEvent/clearLog.
let entries: LogEntry[] = [];
let nextId = 1;

const listeners = new Set<() => void>();

// SSR snapshot: a frozen shared empty array, again for reference stability.
const EMPTY: LogEntry[] = [];

function emit(): void {
  for (const listener of listeners) listener();
}

export function logEvent(
  level: LogLevel,
  source: LogSource,
  message: string,
  detail?: string
): void {
  const entry: LogEntry = {
    id: nextId++,
    at: Date.now(),
    level,
    source,
    message,
    // Keep the key absent rather than `undefined` when there is no payload.
    ...(detail !== undefined && detail !== "" ? { detail } : {}),
  };

  // Copy-on-write so React sees a changed reference; drop the oldest entries
  // once the cap is reached.
  const next = entries.length >= MAX_LOG_ENTRIES
    ? entries.slice(entries.length - MAX_LOG_ENTRIES + 1)
    : entries.slice();
  next.push(entry);
  entries = next;
  emit();
}

export function clearLog(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

/** Non-reactive read — for tests and one-off inspection. */
export function getLogEntries(): LogEntry[] {
  return entries;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LogEntry[] {
  return entries;
}

function getServerSnapshot(): LogEntry[] {
  return EMPTY;
}

/** Subscribes a component to the log; re-renders only when the buffer changes. */
export function useDebugLog(): LogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
