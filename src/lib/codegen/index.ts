import type { Edge } from "@xyflow/react";
import type { GraphNode, GenerateResult } from "./types";
import { jsProfile, pyProfile } from "./profiles";
import { assembleNative } from "./assemble";
import { adaptFromJs } from "./adapters";
import { joinLines } from "./lines";

export { CODE_TARGETS } from "./types";
export type { CodeTarget, CodeLine, GenerateResult } from "./types";

/**
 * Pure function: canvas graph in, source code out. Native emission for
 * Python and JavaScript; TypeScript is the JS emission (the generated JS is
 * already valid TS); C/C++/Go/Rust/PHP are derived from JS via line adapters.
 */
export function generateCode(nodes: GraphNode[], edges: Edge[], target: string): GenerateResult {
  if (target === "python") return assembleNative(nodes, edges, pyProfile);
  const js = assembleNative(nodes, edges, jsProfile);
  if (target === "javascript" || target === "typescript") return js;
  const lines = adaptFromJs(js.lines, target);
  return { code: joinLines(lines), lines, warnings: js.warnings };
}

/**
 * Source map lookup: every 0-based line index emitted for a given node.
 * Used by the UI to highlight the currently-executing node's code, and to
 * decide which lines can carry a breakpoint.
 */
export function linesForNode(result: GenerateResult, nodeId: string): number[] {
  const out: number[] = [];
  result.lines.forEach((line, i) => {
    if (line.nodeId === nodeId) out.push(i);
  });
  return out;
}

/** Inverse lookup: the node a 0-based line index belongs to, if any. */
export function nodeAtLine(result: GenerateResult, index: number): string | undefined {
  return result.lines[index]?.nodeId;
}
