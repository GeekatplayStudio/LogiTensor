/**
 * Drag-and-drop file helpers, shared by the canvas (flow JSON) and the code
 * panel (source files). Deliberately free of React and of DOM globals — the
 * matching/validation rules are the part worth testing, and they run under the
 * node test environment as-is.
 */

/** Files the canvas accepts as a saved flow. */
export const FLOW_EXTENSIONS = [".json"] as const;

/** Files the code editor accepts as source to paste in. */
export const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".c", ".cc", ".cpp", ".h", ".hpp", ".ino",
  ".rs", ".go", ".java", ".cs", ".rb", ".php", ".lua", ".sh",
  ".json", ".yaml", ".yml", ".txt", ".md",
] as const;

/** Anything bigger is a mis-drop, not a flow or a source file. */
export const MAX_DROP_BYTES = 8 * 1024 * 1024;

/** Structural shape of the browser `File` we actually depend on. */
export interface DroppedFile {
  name: string;
  size: number;
  text(): Promise<string>;
}

/** Lowercased extension including the dot, or "" when the name has none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/**
 * True when a drag carries OS files rather than an in-app payload (the node
 * palette drags `application/reactflow`, which must keep its own behaviour).
 */
export function dragHasFiles(types: readonly string[] | undefined): boolean {
  return !!types && Array.prototype.includes.call(types, "Files");
}

/** First dropped file whose extension is accepted, or null. */
export function pickFile<T extends { name: string }>(
  files: readonly T[],
  extensions: readonly string[]
): T | null {
  return files.find((f) => extensions.includes(extensionOf(f.name))) ?? null;
}

export type FlowCheck =
  | { ok: true; nodeCount: number; layerCount: number }
  | { ok: false; reason: string };

/**
 * Shape-checks a dropped JSON file before it is allowed to replace the board.
 * Accepts all three formats `loadFromFile` understands: v2 federation (hubs),
 * v1 (layers) and the legacy single-layer `{ nodes, edges }`.
 */
export function inspectFlowJson(text: string): FlowCheck {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `not valid JSON — ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "top level is not a flow object" };
  }

  const obj = data as Record<string, unknown>;
  const layers: unknown[] = [];
  if (Array.isArray(obj.hubs)) {
    for (const hub of obj.hubs) {
      const hubLayers = (hub as Record<string, unknown> | null)?.layers;
      if (Array.isArray(hubLayers)) layers.push(...hubLayers);
    }
  }
  if (Array.isArray(obj.layers)) layers.push(...obj.layers);

  if (layers.length > 0) {
    let nodeCount = 0;
    for (const layer of layers) {
      const nodes = (layer as Record<string, unknown> | null)?.nodes;
      if (Array.isArray(nodes)) nodeCount += nodes.length;
    }
    return { ok: true, nodeCount, layerCount: layers.length };
  }
  if (Array.isArray(obj.nodes)) {
    return { ok: true, nodeCount: obj.nodes.length, layerCount: 1 };
  }
  return { ok: false, reason: "no hubs, layers or nodes array — not a LogiTensor flow" };
}

/** Reads a dropped file as text, refusing anything implausibly large. */
export async function readDroppedText(file: DroppedFile): Promise<string> {
  if (file.size > MAX_DROP_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`${file.name} is too large (${mb} MB, limit ${MAX_DROP_BYTES / 1024 / 1024} MB)`);
  }
  return file.text();
}
