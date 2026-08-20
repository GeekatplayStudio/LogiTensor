import type { CommandSigner } from "./types";

// HMAC-SHA256 command signing, Web Crypto edition. Must stay byte-identical
// with firmware/esp32video/secure_channel.h, backend/devicelab/secure_test.py
// and mobile/esp32-companion/src/transport/signer.ts:
//
//     mic = HMAC-SHA256(deviceKey, nonce + "|" + command)

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("device key must be hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidDeviceKey(keyHex: string): boolean {
  try {
    return hexToBytes(keyHex).length === 32; // 256-bit
  } catch {
    return false;
  }
}

/**
 * Signs locally with a key this process holds. Only appropriate where the
 * key is genuinely protected (phone Keychain/Keystore) — in a browser,
 * prefer the brokered channel so the key never reaches client code.
 */
export class LocalKeySigner implements CommandSigner {
  private cryptoKey: Promise<CryptoKey>;

  constructor(deviceKeyHex: string) {
    if (!isValidDeviceKey(deviceKeyHex)) {
      throw new Error("device key must be 64 hex characters (256-bit)");
    }
    this.cryptoKey = crypto.subtle.importKey(
      "raw",
      hexToBytes(deviceKeyHex) as unknown as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false, // not extractable
      ["sign"]
    );
  }

  async sign(nonce: string, command: string): Promise<string> {
    const message = new TextEncoder().encode(`${nonce}|${command}`);
    const mac = await crypto.subtle.sign("HMAC", await this.cryptoKey, message);
    return bytesToHex(new Uint8Array(mac));
  }
}

/** Corrupts a MIC so the device must reject it — powers the "watch security
 *  work" demo. Never used on a real command path. */
export function forgeMic(mic: string): string {
  return mic.slice(0, -1) + (mic.at(-1) === "0" ? "1" : "0");
}
