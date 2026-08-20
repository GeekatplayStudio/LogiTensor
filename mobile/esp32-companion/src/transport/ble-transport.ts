import { BleManager, Device, Subscription } from "react-native-ble-plx";
import { Buffer } from "buffer";
import type { AuthTag, DeviceReply, DeviceTransport } from "./types";

// Bluetooth transport. Same interface as WiFi, so application code and the
// security layer above are completely unaware which one is in use.
//
// GATT protocol (mirror of firmware/esp32video/ble_announce.h):
//   write "getnonce"                    -> INFO notifies {"nonce": "..."}
//   write "secure:<cmd>|<nonce>|<mic>"  -> INFO notifies the result JSON
// UUIDs are fixed so the app can filter for our devices during scan.

export const SERVICE_UUID = "7a0e1000-63b1-4be3-9a10-4d3f6e1a2b01";
export const INFO_CHAR_UUID = "7a0e1001-63b1-4be3-9a10-4d3f6e1a2b01";
export const CONTROL_CHAR_UUID = "7a0e1002-63b1-4be3-9a10-4d3f6e1a2b01";

const manager = new BleManager();

/** Scans for devices advertising our service UUID. */
export function scanForDevice(timeoutMs = 10000): Promise<Device> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      reject(new Error("no esp32video device found — is it powered?"));
    }, timeoutMs);
    manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error || device) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        error ? reject(error) : resolve(device!);
      }
    });
  });
}

export class BleTransport implements DeviceTransport {
  readonly kind = "ble" as const;
  private device: Device | null = null;

  constructor(private readonly discovered: Device) {}

  get label(): string {
    return `Bluetooth ${this.discovered.name ?? this.discovered.id}`;
  }

  get connected(): boolean {
    return this.device !== null;
  }

  async connect(): Promise<void> {
    const connected = await this.discovered.connect();
    await connected.discoverAllServicesAndCharacteristics();
    this.device = connected;
  }

  async disconnect(): Promise<void> {
    if (this.device) await this.device.cancelConnection();
    this.device = null;
  }

  /** Writes to CONTROL and resolves with the next JSON on INFO. */
  private writeAndAwait(text: string, timeoutMs = 6000): Promise<Record<string, any>> {
    const device = this.device;
    if (!device) return Promise.reject(new Error("BLE not connected"));
    return new Promise((resolve, reject) => {
      let sub: Subscription | null = null;
      const timer = setTimeout(() => {
        sub?.remove();
        reject(new Error("device did not reply over BLE"));
      }, timeoutMs);
      sub = device.monitorCharacteristicForService(SERVICE_UUID, INFO_CHAR_UUID, (error, ch) => {
        if (error || !ch?.value) return;
        try {
          const parsed = JSON.parse(Buffer.from(ch.value, "base64").toString("utf8"));
          clearTimeout(timer);
          sub?.remove();
          resolve(parsed);
        } catch {
          // A periodic status notify that isn't our reply — keep waiting.
        }
      });
      device
        .writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          CONTROL_CHAR_UUID,
          Buffer.from(text, "utf8").toString("base64")
        )
        .catch((err) => {
          clearTimeout(timer);
          sub?.remove();
          reject(err);
        });
    });
  }

  async requestNonce(): Promise<string> {
    const body = await this.writeAndAwait("getnonce");
    if (typeof body?.nonce !== "string") throw new Error("device did not issue a nonce");
    return body.nonce;
  }

  async sendCommand(command: string, auth: AuthTag | null): Promise<DeviceReply> {
    const envelope = auth ? `secure:${command}|${auth.nonce}|${auth.mic}` : command;
    return { body: await this.writeAndAwait(envelope) };
  }
}
