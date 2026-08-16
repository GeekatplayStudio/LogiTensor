import type { Node } from "@xyflow/react";
import type { NodeData } from "@/types/nodes";
import type { RuntimeHelper } from "./runtime-helpers";

// Language targets shown in the code panel dropdown. `native` targets have a
// real per-node emitter; the rest are derived from the JavaScript emission via
// a deterministic line adapter (see adapters.ts) — same architecture as the
// ash-mesh Device Logic Studio codegen this module is modeled on.
export interface CodeTarget {
  id: string;
  label: string;
  /** shiki grammar name for syntax highlighting */
  grammar: string;
}

export const CODE_TARGETS: CodeTarget[] = [
  { id: "typescript", label: "TypeScript", grammar: "typescript" },
  { id: "javascript", label: "JavaScript", grammar: "javascript" },
  { id: "python", label: "Python", grammar: "python" },
  { id: "c", label: "C (Arduino-style)", grammar: "c" },
  { id: "cpp", label: "C++", grammar: "cpp" },
  { id: "go", label: "Go", grammar: "go" },
  { id: "rust", label: "Rust", grammar: "rust" },
  { id: "php", label: "PHP", grammar: "php" },
];

export type GraphNode = Node<NodeData>;

export interface GenerateResult {
  code: string;
  /** non-fatal notes surfaced above the code (e.g. cycle detected, TODO ports) */
  warnings: string[];
}

// Syntax primitives that differ between the two native languages. Every
// emitter is written once against this interface instead of duplicating the
// per-node logic per language (the one deliberate divergence from ash-mesh,
// which hand-wrote each node twice and paid for it in drift).
export interface LanguageProfile {
  id: "javascript" | "python";
  bool: (b: boolean) => string;
  nil: string;
  not: (e: string) => string;
  and: (a: string, b: string) => string;
  or: (a: string, b: string) => string;
  ternary: (cond: string, a: string, b: string) => string;
  num: (e: string) => string;
  str: (e: string) => string;
  print: (e: string) => string;
  sleepMs: (e: string) => string;
  comment: (text: string) => string;
  /** `pass` in Python, a no-op comment in JS — bodies can never be empty */
  emptyBody: string;
  declare: (name: string, expr: string) => string;
  assign: (name: string, expr: string) => string;
  defLine: (name: string, params: string[]) => string;
  ifLine: (cond: string) => string;
  elseLine: string;
  forRange: (v: string, count: string) => string;
  whileLine: (cond: string) => string;
  /** closing brace in JS, nothing in Python (indentation closes blocks) */
  blockClose: string;
  callStmt: (name: string, args: string[]) => string;
  strLen: (e: string) => string;
  strUpper: (e: string) => string;
  strLower: (e: string) => string;
  strTrim: (e: string) => string;
  strReverse: (e: string) => string;
  strIncludes: (hay: string, needle: string) => string;
  strReplaceAll: (text: string, find: string, repl: string) => string;
  mathFn: (op: string, a: string, b: string) => string;
  maxOf: (items: string[]) => string;
  absNeg: (e: string) => string;
  randomInt: (min: string, max: string) => string;
  /** plain truthiness cast (NOT the text-aware lb_to_bool helper) */
  boolCast: (e: string) => string;
  /** current time as epoch milliseconds */
  nowEpochMs: string;
  /** current time as a human-readable clock string */
  nowFormatted: string;
  /** append one item to an existing list variable, as a statement */
  listPush: (name: string, expr: string) => string;
  /** source lines of a named generated-program helper (runtime-helpers.ts) */
  helper: (name: RuntimeHelper) => string[];
}

// One node's contribution to the program (ash-mesh `emit()` contract):
// `setup` lines run once, `outputs` maps data ports to expression strings
// spliced into downstream nodes, and trigger-driven behavior is generated
// separately by the chain walker (chains.ts).
export interface NodeEmission {
  setup?: string[];
  outputs?: Record<string, string>;
}
