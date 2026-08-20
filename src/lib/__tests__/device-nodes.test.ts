import { describe, it, expect } from "vitest";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { DEVICE_LAB_NODES } from "@/types/node-definitions/device-lab";
import { computeNodeOutputs, handleTriggerOperation } from "../execution-helpers";
import {
  DEVICE_COMPUTE,
  DEVICE_TRIGGER_OPS,
  SIM_BLE_DEVICES,
  simWifiConnect,
  simWifiScan,
} from "../device-node-compute";
import { nodeTypes } from "@/components/node-editor/node-types-registry";
import { getNodeIcon } from "../node-icons";
import { getCategoryStyles } from "../node-styles";

describe("Device Lab registry completeness", () => {
  const types = Object.keys(DEVICE_LAB_NODES);

  it("every node is merged into NODE_DEFINITIONS with the Device Lab category", () => {
    for (const type of types) {
      expect(NODE_DEFINITIONS[type]).toBeDefined();
      expect(NODE_DEFINITIONS[type].category).toBe("Device Lab");
    }
  });

  it("every node has an XYFlow renderer, compute, trigger op, and an icon", () => {
    for (const type of types) {
      expect(nodeTypes[type as keyof typeof nodeTypes]).toBeDefined();
      expect(DEVICE_COMPUTE[type]).toBeDefined();
      expect(DEVICE_TRIGGER_OPS[type]).toBeDefined();
      expect(getNodeIcon(type, "Device Lab")).toBeTruthy();
    }
  });

  it("the category has bespoke styles (not the Logic fallback)", () => {
    expect(getCategoryStyles("Device Lab", false)).not.toBe(getCategoryStyles("Logic", false));
  });
});

describe("Device Lab simulation semantics", () => {
  it("wifiScan trigger stores the deterministic fixture and reflects it", async () => {
    const trig = await handleTriggerOperation("wifiScan", {}, { band: "2.4" }, "inTrigger");
    expect(trig.nextTriggerPort).toBe("outTrigger");
    expect(trig.updatedConfig?.networks).toEqual(["HomeNet-2.4G", "CoffeeShop", "IoT-Sensors"]);
    const outputs = computeNodeOutputs("wifiScan", {}, trig.updatedConfig!);
    expect(outputs.count).toBe(3);
  });

  it("wifiScan 'all' concatenates every band", () => {
    expect(simWifiScan("all")).toHaveLength(6);
    expect(simWifiScan("6")).toEqual(["HomeNet-6E"]);
    expect(simWifiScan("nope")).toEqual([]);
  });

  it("wifiConnect enforces the 8-char WPA passphrase minimum", async () => {
    expect(simWifiConnect("HomeNet", "short").connected).toBe(false);
    expect(simWifiConnect("", "longenough").connected).toBe(false);
    expect(simWifiConnect("HomeNet", "longenough")).toEqual({
      connected: true,
      ip: "192.168.1.42",
      rssi: -55,
    });
    const trig = await handleTriggerOperation(
      "wifiConnect",
      { ssid: "HomeNet", password: "longenough" },
      { security: "wpa2" },
      "inTrigger"
    );
    expect(computeNodeOutputs("wifiConnect", {}, trig.updatedConfig!).connected).toBe(true);
  });

  it("bleScan stores the fixture device list", async () => {
    const trig = await handleTriggerOperation("bleScan", {}, { durationMs: 3000 }, "inTrigger");
    expect(trig.updatedConfig?.devices).toEqual(SIM_BLE_DEVICES);
    expect(computeNodeOutputs("bleScan", {}, trig.updatedConfig!).count).toBe(3);
  });

  it("usbSerialSend simulates a successful send and records the text", async () => {
    const trig = await handleTriggerOperation(
      "usbSerialSend",
      { text: "hello board" },
      { port: "", baud: 115200, newline: true },
      "inTrigger"
    );
    expect(trig.nextTriggerPort).toBe("outTrigger");
    expect(trig.updatedConfig?.sent).toBe(true);
    expect(trig.updatedConfig?.lastText).toBe("hello board");
    expect(computeNodeOutputs("usbSerialSend", {}, trig.updatedConfig!).sent).toBe(true);
  });
});
