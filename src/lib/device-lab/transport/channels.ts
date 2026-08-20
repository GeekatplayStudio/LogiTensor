import { secureTest } from "../api";
import { forgeMic } from "./signer";
import type {
  CommandChannel,
  CommandResult,
  CommandSigner,
  DeviceTransport,
  TransportKind,
} from "./types";

// The two ways an app can hold the authority to command a device.
//
// BrokeredChannel — the key lives in the backend keystore and never reaches
//   client code. Correct for a browser/desktop UI: a page cannot leak a key
//   it was never given.
//
// SignedChannel — this client holds the key and signs locally. Correct for a
//   phone, where the key sits in Keychain/Keystore. Works over ANY transport
//   because the transport moves bytes and nothing else.

/** Desktop/web: ask the backend to sign and deliver the command. */
export class BrokeredChannel implements CommandChannel {
  readonly kind: TransportKind = "wifi";

  constructor(private readonly ip: string, private readonly deviceId: string) {}

  get label(): string {
    return `WiFi ${this.ip} (key held by backend)`;
  }

  async execute(command: string, options?: { forge?: boolean }): Promise<CommandResult> {
    const result = await secureTest(this.ip, this.deviceId, command, options?.forge ?? false);
    return {
      command,
      transport: this.kind,
      ok: result.status === 200 && result.response?.ok !== false,
      forged: result.forged,
      roundTripMs: result.roundTripMs,
      response: result.response ?? {},
    };
  }
}

/** Mobile/edge: sign here, send over whichever transport is connected. */
export class SignedChannel implements CommandChannel {
  constructor(
    private readonly transport: DeviceTransport,
    /** null = learning mode: unauthenticated, only works on unkeyed firmware. */
    private readonly signer: CommandSigner | null
  ) {}

  get kind(): TransportKind {
    return this.transport.kind;
  }

  get label(): string {
    return this.transport.label;
  }

  async execute(command: string, options?: { forge?: boolean }): Promise<CommandResult> {
    const started = Date.now();
    let auth = null;
    if (this.signer) {
      // Fresh nonce per command: this is what makes captured traffic
      // useless to replay.
      const nonce = await this.transport.requestNonce();
      const mic = await this.signer.sign(nonce, command);
      auth = { nonce, mic: options?.forge ? forgeMic(mic) : mic };
    }
    const reply = await this.transport.sendCommand(command, auth);
    return {
      command,
      transport: this.transport.kind,
      ok: reply.status !== 401 && reply.body?.ok !== false,
      forged: options?.forge ?? false,
      roundTripMs: Date.now() - started,
      response: reply.body ?? {},
    };
  }
}
