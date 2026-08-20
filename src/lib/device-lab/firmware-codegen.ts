import type { Node, Edge } from "@xyflow/react";

// Generates a real, compilable Arduino sketch (.ino) from the board graph
// for the Device Lab flash wizard — unlike the code panel's C target (a
// lexical adaptation of the JS emission), this walks the trigger chains and
// emits genuine hardware calls for the node set a device can execute.
// Unsupported nodes become honest TODO comments rather than broken code.
//
// WiFi credentials are NOT baked into the source here: wifiConnect emits
// WIFI_SSID / WIFI_PSK macros which the backend injects as compile-time
// -D defines (see backend/devicelab/build.py) so secrets never sit in the
// staged .ino or the job log.

interface Ctx {
  nodes: Map<string, Node>;
  edges: Edge[];
  includes: Set<string>;
  globals: Set<string>;
  needsWifiDefines: boolean;
  warnings: string[];
}

const SUPPORTED = new Set([
  "triggerInput",
  "wifiScan",
  "wifiConnect",
  "bleScan",
  "usbSerialSend",
  "loggerNode",
  "textOutputNode",
  "delayNode",
]);

function cString(value: unknown): string {
  return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Static or const-node-fed data input, as a C literal. */
function dataInput(ctx: Ctx, nodeId: string, portId: string): string {
  const edge = ctx.edges.find((e) => e.target === nodeId && e.targetHandle === portId);
  if (edge?.source) {
    const src = ctx.nodes.get(edge.source);
    const cfg = (src?.data as any)?.config ?? {};
    if (src?.type === "constString") return cString(cfg.value);
    if (src?.type === "constNum") return String(Number(cfg.value ?? 0));
    if (src?.type === "constBool") return cfg.value ? "true" : "false";
    ctx.warnings.push(
      `Input ${portId}: wired from unsupported node "${src?.type}" — using its last static value.`
    );
  }
  const node = ctx.nodes.get(nodeId);
  const port = ((node?.data as any)?.inputs ?? []).find((p: any) => p.id === portId);
  const value = port?.value;
  return typeof value === "number" ? String(value) : cString(value);
}

function chainFrom(ctx: Ctx, nodeId: string, outPort: string, seen: Set<string>): string[] {
  const lines: string[] = [];
  for (const edge of ctx.edges.filter((e) => e.source === nodeId && e.sourceHandle === outPort)) {
    if (!edge.target || seen.has(edge.target)) continue;
    seen.add(edge.target);
    lines.push(...stepInto(ctx, edge.target, seen));
    seen.delete(edge.target);
  }
  return lines;
}

function stepInto(ctx: Ctx, nodeId: string, seen: Set<string>): string[] {
  const node = ctx.nodes.get(nodeId);
  if (!node) return [];
  const cfg = (node.data as any)?.config ?? {};
  const label = (node.data as any)?.label ?? node.type;
  const out: string[] = [`  // ${label}`];

  switch (node.type) {
    case "wifiScan":
      ctx.includes.add("#include <WiFi.h>");
      out.push(
        "  {",
        "    int n = WiFi.scanNetworks();",
        '    Serial.printf("WiFi networks found: %d\\n", n);',
        "    for (int i = 0; i < n; i++) {",
        '      Serial.printf("  %s (%d dBm)\\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i));',
        "    }",
        "  }"
      );
      out.push(...chainFrom(ctx, nodeId, "outTrigger", seen));
      break;
    case "wifiConnect":
      ctx.includes.add("#include <WiFi.h>");
      ctx.needsWifiDefines = true;
      out.push(
        "  WiFi.mode(WIFI_STA);",
        "  WiFi.begin(WIFI_SSID, WIFI_PSK);",
        '  Serial.print("Connecting to WiFi");',
        "  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {",
        "    delay(250);",
        '    Serial.print(".");',
        "  }",
        "  if (WiFi.status() == WL_CONNECTED) {",
        '    Serial.printf("\\nConnected: %s (RSSI %d dBm)\\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());',
        "  } else {",
        '    Serial.println("\\nWiFi connection failed");',
        "  }"
      );
      out.push(...chainFrom(ctx, nodeId, "outTrigger", seen));
      break;
    case "bleScan": {
      ctx.includes.add("#include <BLEDevice.h>");
      const secs = Math.max(1, Math.round(Number(cfg.durationMs ?? 3000) / 1000));
      ctx.globals.add("BLEScan* lbBleScan = nullptr;");
      out.push(
        "  if (lbBleScan == nullptr) {",
        '    BLEDevice::init("LogiBoard");',
        "    lbBleScan = BLEDevice::getScan();",
        "    lbBleScan->setActiveScan(true);",
        "  }",
        "  {",
        `    BLEScanResults* results = lbBleScan->start(${secs}, false);`,
        '    Serial.printf("BLE devices found: %d\\n", results->getCount());',
        "    for (int i = 0; i < results->getCount(); i++) {",
        "      BLEAdvertisedDevice d = results->getDevice(i);",
        '      Serial.printf("  %s %s\\n", d.getAddress().toString().c_str(), d.getName().c_str());',
        "    }",
        "    lbBleScan->clearResults();",
        "  }"
      );
      out.push(...chainFrom(ctx, nodeId, "outTrigger", seen));
      break;
    }
    case "usbSerialSend":
      out.push(
        cfg.newline === false
          ? `  Serial.print(${dataInput(ctx, nodeId, "text")});`
          : `  Serial.println(${dataInput(ctx, nodeId, "text")});`
      );
      out.push(...chainFrom(ctx, nodeId, "outTrigger", seen));
      break;
    case "loggerNode":
    case "textOutputNode":
      out.push(`  Serial.println(${dataInput(ctx, nodeId, "value")});`);
      out.push(...chainFrom(ctx, nodeId, "outTrigger", seen));
      break;
    case "delayNode":
      out.push(`  delay(${Math.max(0, Math.round(Number(dataInput(ctx, nodeId, "delayMs")) || 1000))});`);
      out.push(...chainFrom(ctx, nodeId, "outTrigger", seen));
      break;
    default:
      ctx.warnings.push(`Node "${label}" (${node.type}) has no firmware mapping — emitted as a TODO.`);
      out.push(`  // TODO: node "${label}" (${node.type}) is not yet supported on-device`);
      break;
  }
  return out;
}

export interface FirmwareResult {
  code: string;
  needsWifiDefines: boolean;
  warnings: string[];
  supportedNodeTypes: string[];
}

export function generateFirmwareSketch(nodes: Node[], edges: Edge[]): FirmwareResult {
  const ctx: Ctx = {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges,
    includes: new Set(),
    globals: new Set(),
    needsWifiDefines: false,
    warnings: [],
  };

  const triggers = nodes.filter((n) => n.type === "triggerInput");
  const bodies: string[] = [];
  for (const trigger of triggers) {
    const label = (trigger.data as any)?.label ?? "Manual Trigger";
    bodies.push(`  // === chain from "${label}" ===`);
    bodies.push(...chainFrom(ctx, trigger.id, "triggerOut", new Set([trigger.id])));
  }
  if (triggers.length === 0) {
    ctx.warnings.push("No Manual Trigger on the board — the sketch has nothing to run.");
  }

  const parts = [
    "// Generated by LogiBoard Device Lab — graph-to-firmware",
    ...Array.from(ctx.includes),
    ...(ctx.needsWifiDefines
      ? [
          "// WIFI_SSID / WIFI_PSK are injected at compile time (-D defines) —",
          "// set them in the flash wizard; they are never stored in this file.",
          "#ifndef WIFI_SSID",
          '#define WIFI_SSID ""',
          "#endif",
          "#ifndef WIFI_PSK",
          '#define WIFI_PSK ""',
          "#endif",
        ]
      : []),
    ...Array.from(ctx.globals),
    "",
    "void setup() {",
    "  Serial.begin(115200);",
    "  delay(1500); // allow the USB CDC console to attach",
    ...bodies,
    "}",
    "",
    "void loop() {",
    "  delay(1000);",
    "}",
    "",
  ];
  return {
    code: parts.join("\n"),
    needsWifiDefines: ctx.needsWifiDefines,
    warnings: ctx.warnings,
    supportedNodeTypes: Array.from(SUPPORTED),
  };
}
