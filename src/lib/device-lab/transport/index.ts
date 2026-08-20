// Public surface of the device communication layer.
//
// Application code should import from here and depend on CommandChannel —
// never on a concrete transport — so a screen written for WiFi works over
// Bluetooth or serial unchanged.

export type {
  AuthTag,
  CommandChannel,
  CommandResult,
  CommandSigner,
  DeviceReply,
  DeviceTransport,
  TransportKind,
} from "./types";
export { DEVICE_COMMANDS } from "./types";
export { LocalKeySigner, isValidDeviceKey, forgeMic, hexToBytes, bytesToHex } from "./signer";
export { WifiTransport } from "./wifi-transport";
export { BrokeredChannel, SignedChannel } from "./channels";

import { BrokeredChannel, SignedChannel } from "./channels";
import { LocalKeySigner } from "./signer";
import { WifiTransport } from "./wifi-transport";
import type { CommandChannel } from "./types";

/**
 * Builds the right channel for the situation.
 *
 * Prefer `deviceId` (brokered): the backend keeps the key, so no secret ever
 * reaches page JavaScript. Pass `deviceKeyHex` only where holding the key
 * client-side is genuinely appropriate.
 */
export function createChannel(options: {
  ip: string;
  deviceId?: string;
  deviceKeyHex?: string;
}): CommandChannel {
  if (options.deviceId) return new BrokeredChannel(options.ip, options.deviceId);
  const transport = new WifiTransport(options.ip);
  const signer = options.deviceKeyHex ? new LocalKeySigner(options.deviceKeyHex) : null;
  return new SignedChannel(transport, signer);
}
