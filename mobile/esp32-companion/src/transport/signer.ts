import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import type { CommandSigner } from "./types";

// mic = HMAC-SHA256(deviceKey, nonce + "|" + command)
// Byte-identical to firmware/esp32video/secure_channel.h,
// backend/devicelab/secure_test.py and the desktop signer.

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("device key must be hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidDeviceKey(keyHex: string): boolean {
  try {
    return hexToBytes(keyHex).length === 32;
  } catch {
    return false;
  }
}

/** Signs with the key held in this device's secure storage. */
export class LocalKeySigner implements CommandSigner {
  private readonly key: Uint8Array;

  constructor(deviceKeyHex: string) {
    if (!isValidDeviceKey(deviceKeyHex)) {
      throw new Error("device key must be 64 hex characters (256-bit)");
    }
    this.key = hexToBytes(deviceKeyHex);
  }

  sign(nonce: string, command: string): string {
    const message = new TextEncoder().encode(`${nonce}|${command}`);
    return bytesToHex(hmac(sha256, this.key, message));
  }
}
