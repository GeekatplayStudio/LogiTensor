import type { Edge } from "@xyflow/react";
import type { GraphNode, GenerateResult } from "./types";
import { jsProfile, pyProfile } from "./profiles";
import { assembleNative } from "./assemble";
import { adaptFromJs } from "./adapters";

export { CODE_TARGETS } from "./types";
export type { CodeTarget, GenerateResult } from "./types";

/**
 * Pure function: canvas graph in, source code out. Native emission for
 * Python and JavaScript; TypeScript is the JS emission (the generated JS is
 * already valid TS); C/C++/Go/Rust/PHP are derived from JS via line adapters.
 */
export function generateCode(nodes: GraphNode[], edges: Edge[], target: string): GenerateResult {
  if (target === "python") return assembleNative(nodes, edges, pyProfile);
  const js = assembleNative(nodes, edges, jsProfile);
  if (target === "javascript" || target === "typescript") return js;
  return { code: adaptFromJs(js.code, target), warnings: js.warnings };
}
