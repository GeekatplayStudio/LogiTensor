import type { TriggerResult } from "./extra-trigger-ops";
import { toList } from "./node-value-utils";

/**
 * Canvas-side behaviour for the Device Lab nodes: a deterministic
 * simulation (no hardware needed, fully testable) mirrored in
 * backend/engine/device.py. Real radio/serial work happens either on the
 * flashed device (codegen) or backend-side (usbSerialSend).
 *
 * Registry pattern per the 500-line guardrail — spread into
 * execution-helpers.ts like EXTRA_COMPUTE / EXTRA_TRIGGER_OPS.
 */

// Deterministic fixture networks per band, so lessons and tests agree on
// what a scan "finds".
export const SIM_WIFI_NETWORKS: Record<string, string[]> = {
  "2.4": ["HomeNet-2.4G", "CoffeeShop", "IoT-Sensors"],
  "5": ["HomeNet-5G", "Office-5G"],
  "6": ["HomeNet-6E"],
};

export const SIM_BLE_DEVICES = ["ESP32-S3 DevKit", "Feather nRF52", "SmartBulb-01"];

// WPA2/WPA3 passphrases must be at least 8 characters — the simulation
// enforces the real constraint so the lesson teaches it.
export function simWifiConnect(ssid: string, password: string): {
  connected: boolean;
  ip: string;
  rssi: number;
} {
  const connected = ssid.trim() !== "" && password.length >= 8;
  return {
    connected,
    ip: connected ? "192.168.1.42" : "",
    rssi: connected ? -55 : 0,
  };
}

export function simWifiScan(band: string): string[] {
  if (band === "all") {
    return [...SIM_WIFI_NETWORKS["2.4"], ...SIM_WIFI_NETWORKS["5"], ...SIM_WIFI_NETWORKS["6"]];
  }
  return SIM_WIFI_NETWORKS[band] ?? [];
}

type Compute = (
  inputs: Record<string, any>,
  config: Record<string, any>
) => Record<string, any>;

// Passive outputs just reflect the state the last trigger stored in config
// (the counterNode convention for stateful nodes).
export const DEVICE_COMPUTE: Record<string, Compute> = {
  wifiScan: (_inputs, config) => {
    const networks = toList(config.networks);
    return { networks, count: networks.length };
  },
  wifiConnect: (_inputs, config) => ({
    connected: Boolean(config.connected),
    ip: String(config.ip ?? ""),
    rssi: Number(config.rssi ?? 0),
  }),
  bleScan: (_inputs, config) => {
    const devices = toList(config.devices);
    return { devices, count: devices.length };
  },
  usbSerialSend: (_inputs, config) => ({ sent: Boolean(config.sent) }),
};

// None of the Device Lab nodes carry the Enabled bypass in Phase 1.
export const DEVICE_BYPASS_PORTS: Record<string, { primaryIn: string; primaryOut: string }> = {};

type TriggerOp = (
  inputs: Record<string, any>,
  config: Record<string, any>,
  targetPortId: string
) => TriggerResult;

export const DEVICE_TRIGGER_OPS: Record<string, TriggerOp> = {
  wifiScan: (_inputs, config) => ({
    nextTriggerPort: "outTrigger",
    updatedConfig: { ...config, networks: simWifiScan(String(config.band ?? "all")) },
  }),

  wifiConnect: (inputs, config) => {
    const result = simWifiConnect(String(inputs.ssid ?? ""), String(inputs.password ?? ""));
    return {
      // Fire Done either way; the Connected output reports the outcome.
      nextTriggerPort: "outTrigger",
      updatedConfig: { ...config, ...result },
    };
  },

  bleScan: (_inputs, config) => ({
    nextTriggerPort: "outTrigger",
    updatedConfig: { ...config, devices: [...SIM_BLE_DEVICES] },
  }),

  usbSerialSend: (inputs, config) => ({
    nextTriggerPort: "outTrigger",
    // The canvas simulation always "sends"; the backend replaces this with
    // a real write when the configured port has an open monitor session.
    updatedConfig: { ...config, sent: true, lastText: String(inputs.text ?? "") },
  }),
};
