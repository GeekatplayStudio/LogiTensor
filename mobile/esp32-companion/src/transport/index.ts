import { LocalKeySigner } from "./signer";
import type {
  CommandChannel,
  CommandResult,
  CommandSigner,
  DeviceTransport,
  TransportKind,
} from "./types";

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
export { LocalKeySigner, isValidDeviceKey } from "./signer";
export { WifiTransport } from "./wifi-transport";
export { BleTransport, scanForDevice } from "./ble-transport";

/**
 * Signs each command with the key this phone holds, then hands it to
 * whichever transport is connected. The one class that makes WiFi and
 * Bluetooth behave identically to the rest of the app.
 */
export class SignedChannel implements CommandChannel {
  constructor(
    private readonly transport: DeviceTransport,
    /** null = learning mode (only works against unkeyed firmware). */
    private readonly signer: CommandSigner | null
  ) {}

  get kind(): TransportKind {
    return this.transport.kind;
  }

  get label(): string {
    return this.transport.label;
  }

  async execute(command: string): Promise<CommandResult> {
    const started = Date.now();
    let auth = null;
    if (this.signer) {
      // Fresh nonce per command — this is what defeats replay.
      const nonce = await this.transport.requestNonce();
      auth = { nonce, mic: this.signer.sign(nonce, command) };
    }
    const reply = await this.transport.sendCommand(command, auth);
    return {
      command,
      transport: this.transport.kind,
      ok: reply.status !== 401 && reply.body?.ok !== false,
      roundTripMs: Date.now() - started,
      response: reply.body ?? {},
    };
  }
}

/** Wraps a connected transport with the key from secure storage. */
export function createChannel(
  transport: DeviceTransport,
  deviceKeyHex: string | null
): CommandChannel {
  return new SignedChannel(transport, deviceKeyHex ? new LocalKeySigner(deviceKeyHex) : null);
}
