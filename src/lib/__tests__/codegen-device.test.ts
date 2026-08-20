import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "@/types/nodes";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { generateCode } from "../codegen";
import { generateFirmwareSketch } from "../device-lab/firmware-codegen";

function makeNode(type: string, id: string, config?: Record<string, unknown>): Node<NodeData> {
  const def = NODE_DEFINITIONS[type];
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label: def.label,
      type,
      inputs: def.inputs.map((i) => ({ ...i })),
      outputs: def.outputs.map((o) => ({ ...o })),
      config: { ...(def.config ?? {}), ...(config ?? {}) },
    },
  };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return { id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle };
}

describe("code panel emission for Device Lab nodes", () => {
  const nodes = [
    makeNode("triggerInput", "t1"),
    makeNode("wifiScan", "w1", { band: "5" }),
    makeNode("usbSerialSend", "s1"),
    makeNode("constString", "c1", { value: "done" }),
  ];
  const edges = [
    edge("t1", "triggerOut", "w1", "inTrigger"),
    edge("w1", "outTrigger", "s1", "inTrigger"),
    edge("c1", "value", "s1", "text"),
  ];

  it("emits the simulation with on-device comments in JS", () => {
    const js = generateCode(nodes, edges, "javascript");
    expect(js.code).toContain("on-device: WiFi.scanNetworks()");
    expect(js.code).toContain('["HomeNet-5G", "Office-5G"]');
    expect(js.code).toContain("on-device: Serial.println() at 115200 baud");
    expect(js.code).not.toContain("has no code mapping");
  });

  it("emits valid Python for the same graph", () => {
    const py = generateCode(nodes, edges, "python");
    expect(py.code).toContain("on-device: WiFi.scanNetworks()");
    expect(py.code).toContain('print("done")');
  });
});

describe("generateFirmwareSketch (flash wizard)", () => {
  it("emits real Arduino calls for a trigger chain", () => {
    const nodes = [
      makeNode("triggerInput", "t1"),
      makeNode("wifiConnect", "w1"),
      makeNode("usbSerialSend", "s1"),
      makeNode("constString", "c1", { value: "online" }),
    ];
    const edges = [
      edge("t1", "triggerOut", "w1", "inTrigger"),
      edge("w1", "outTrigger", "s1", "inTrigger"),
      edge("c1", "value", "s1", "text"),
    ];
    const fw = generateFirmwareSketch(nodes, edges);
    expect(fw.code).toContain("#include <WiFi.h>");
    expect(fw.code).toContain("WiFi.begin(WIFI_SSID, WIFI_PSK);");
    expect(fw.code).toContain('Serial.println("online");');
    expect(fw.code).toContain("void setup()");
    expect(fw.needsWifiDefines).toBe(true);
    // Credentials never appear in the source — only the empty-fallback
    // macros do; real values arrive as -D defines at compile time.
    expect(fw.code).not.toMatch(/#define WIFI_(SSID|PSK) "[^"]/);
  });

  it("marks unsupported nodes as TODO comments instead of broken code", () => {
    const nodes = [makeNode("triggerInput", "t1"), makeNode("counterNode", "k1")];
    const edges = [edge("t1", "triggerOut", "k1", "incTrigger")];
    const fw = generateFirmwareSketch(nodes, edges);
    expect(fw.code).toContain("// TODO: node");
    expect(fw.warnings.length).toBeGreaterThan(0);
  });

  it("warns when the board has no Manual Trigger", () => {
    const fw = generateFirmwareSketch([makeNode("wifiScan", "w1")], []);
    expect(fw.warnings.some((w) => w.includes("No Manual Trigger"))).toBe(true);
  });
});
