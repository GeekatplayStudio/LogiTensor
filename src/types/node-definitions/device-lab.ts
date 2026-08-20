import type { NodeDefinition } from "./base";

/**
 * Device Lab connectivity nodes. On the canvas they run a deterministic
 * simulation (see device-node-compute.ts) so graphs are testable without
 * hardware; sent to a device via the Device Lab flash wizard, they compile
 * to real Arduino calls (codegen/expressions-device.ts), and the Python
 * engine mirrors the simulation (backend/engine/device.py) — usbSerialSend
 * additionally does real serial I/O backend-side when a monitor session
 * holds the configured port.
 */
export const DEVICE_LAB_NODES: Record<string, NodeDefinition> = {
  wifiScan: {
    type: "wifiScan",
    label: "WiFi Scan",
    category: "Device Lab",
    description:
      "Scans for WiFi networks on the selected band (2.4 / 5 / 6 GHz). Simulated on the canvas; on-device it runs WiFi.scanNetworks().",
    inputs: [{ id: "inTrigger", name: "Scan", type: "trigger" }],
    outputs: [
      { id: "outTrigger", name: "Done", type: "trigger" },
      { id: "networks", name: "Networks", type: "data", dataType: "any" },
      { id: "count", name: "Count", type: "data", dataType: "number" },
    ],
    // band: "2.4" | "5" | "6" | "all". Scan results live in config so the
    // node is stateful across triggers, like counterNode.
    config: { band: "all", networks: [] as string[] },
  },
  wifiConnect: {
    type: "wifiConnect",
    label: "WiFi Connect",
    category: "Device Lab",
    description:
      "Joins a WiFi network with WPA2/WPA3 security. Simulated on the canvas (connects when SSID is set and the password meets the 8-char WPA minimum); on-device it runs WiFi.begin().",
    inputs: [
      { id: "inTrigger", name: "Connect", type: "trigger" },
      { id: "ssid", name: "SSID", type: "data", dataType: "string", value: "" },
      { id: "password", name: "Password", type: "data", dataType: "string", value: "" },
    ],
    outputs: [
      { id: "outTrigger", name: "Done", type: "trigger" },
      { id: "connected", name: "Connected", type: "data", dataType: "boolean" },
      { id: "ip", name: "IP", type: "data", dataType: "string" },
      { id: "rssi", name: "RSSI", type: "data", dataType: "number" },
    ],
    // security: "wpa2" | "wpa3"
    config: { security: "wpa2", connected: false, ip: "", rssi: 0 },
  },
  bleScan: {
    type: "bleScan",
    label: "BLE Scan",
    category: "Device Lab",
    description:
      "Scans for Bluetooth Low Energy advertisers for the configured duration. Simulated on the canvas; on-device it uses the NimBLE scanner.",
    inputs: [{ id: "inTrigger", name: "Scan", type: "trigger" }],
    outputs: [
      { id: "outTrigger", name: "Done", type: "trigger" },
      { id: "devices", name: "Devices", type: "data", dataType: "any" },
      { id: "count", name: "Count", type: "data", dataType: "number" },
    ],
    config: { durationMs: 3000, devices: [] as string[] },
  },
  usbSerialSend: {
    type: "usbSerialSend",
    label: "USB Serial Send",
    category: "Device Lab",
    description:
      "Writes a line of text over USB serial. Simulated on the canvas; the backend writes to the real port when a Device Lab monitor session has it open; on-device it becomes Serial.println().",
    inputs: [
      { id: "inTrigger", name: "Send", type: "trigger" },
      { id: "text", name: "Text", type: "data", dataType: "string", value: "" },
    ],
    outputs: [
      { id: "outTrigger", name: "Sent", type: "trigger" },
      { id: "sent", name: "Sent OK", type: "data", dataType: "boolean" },
    ],
    config: { port: "", baud: 115200, newline: true, sent: false },
  },
};
