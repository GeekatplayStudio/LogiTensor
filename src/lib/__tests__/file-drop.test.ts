import { describe, it, expect } from "vitest";
import {
  CODE_EXTENSIONS,
  FLOW_EXTENSIONS,
  MAX_DROP_BYTES,
  dragHasFiles,
  extensionOf,
  inspectFlowJson,
  pickFile,
  readDroppedText,
} from "@/lib/file-drop";

const file = (name: string, text = "", size = text.length) => ({
  name,
  size,
  text: async () => text,
});

describe("extensionOf", () => {
  it("lowercases and keeps the dot", () => {
    expect(extensionOf("Flow.JSON")).toBe(".json");
    expect(extensionOf("a/b/main.py")).toBe(".py");
  });

  it("returns empty for names without a usable extension", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
  });
});

describe("dragHasFiles", () => {
  it("separates OS file drags from in-app node drags", () => {
    expect(dragHasFiles(["Files"])).toBe(true);
    expect(dragHasFiles(["application/reactflow"])).toBe(false);
    expect(dragHasFiles(undefined)).toBe(false);
  });
});

describe("pickFile", () => {
  it("takes the first accepted file and ignores the rest", () => {
    const picked = pickFile([file("notes.pdf"), file("flow.json")], FLOW_EXTENSIONS);
    expect(picked?.name).toBe("flow.json");
  });

  it("returns null when nothing matches", () => {
    expect(pickFile([file("photo.png")], CODE_EXTENSIONS)).toBeNull();
  });
});

describe("inspectFlowJson", () => {
  it("accepts the v2 federation format and counts nodes across hubs", () => {
    const text = JSON.stringify({
      version: 2,
      activeHubId: "hub_default",
      hubs: [
        { id: "hub_default", layers: [{ id: "l1", nodes: [{ id: "n1" }, { id: "n2" }], edges: [] }] },
        { id: "hub_two", layers: [{ id: "l2", nodes: [{ id: "n3" }], edges: [] }] },
      ],
    });
    expect(inspectFlowJson(text)).toEqual({ ok: true, nodeCount: 3, layerCount: 2 });
  });

  it("accepts the v1 layers format", () => {
    const text = JSON.stringify({ activeLayerId: "l1", layers: [{ id: "l1", nodes: [{ id: "n1" }], edges: [] }] });
    expect(inspectFlowJson(text)).toEqual({ ok: true, nodeCount: 1, layerCount: 1 });
  });

  it("accepts the legacy single-layer format", () => {
    const text = JSON.stringify({ nodes: [{ id: "n1" }, { id: "n2" }], edges: [] });
    expect(inspectFlowJson(text)).toEqual({ ok: true, nodeCount: 2, layerCount: 1 });
  });

  it("rejects malformed JSON", () => {
    const check = inspectFlowJson("{ not json");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("not valid JSON");
  });

  it("rejects JSON that is not a flow", () => {
    expect(inspectFlowJson(JSON.stringify({ name: "package", version: "1.0.0" })).ok).toBe(false);
    expect(inspectFlowJson(JSON.stringify([1, 2, 3])).ok).toBe(false);
    expect(inspectFlowJson("null").ok).toBe(false);
  });

  it("does not treat an empty hub as a loadable flow", () => {
    expect(inspectFlowJson(JSON.stringify({ hubs: [] })).ok).toBe(false);
  });
});

describe("readDroppedText", () => {
  it("reads the file contents", async () => {
    await expect(readDroppedText(file("main.py", "print(1)"))).resolves.toBe("print(1)");
  });

  it("refuses implausibly large files", async () => {
    await expect(readDroppedText(file("huge.json", "", MAX_DROP_BYTES + 1))).rejects.toThrow(/too large/);
  });
});
