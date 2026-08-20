// Communication abstraction for talking to devices.
//
// The whole point of this layer: SECURITY LIVES ABOVE TRANSPORT. A command
// is authenticated the same way whether it travels over WiFi, Bluetooth or
// a USB cable, so adding a transport can never quietly add a way in.
//
//   CommandChannel        what application code calls
//     ├── BrokeredChannel   backend holds the key and signs   (desktop/web)
//     └── SignedChannel     this client holds the key and signs (mobile)
//            └── DeviceTransport   wifi | ble | serial: moves bytes only

export type TransportKind = "wifi" | "ble" | "serial";

/** Single-use proof that this command was issued by the key holder. */
export interface AuthTag {
  nonce: string;
  mic: string;
}

export interface DeviceReply {
  /** Parsed JSON from the device (or an error envelope). */
  body: Record<string, unknown>;
  /** Transport-level status, where the transport has one (HTTP code). */
  status?: number;
}

export interface CommandResult {
  command: string;
  transport: TransportKind;
  /** The device accepted and executed the command. */
  ok: boolean;
  /** True when the command was deliberately signed wrong (security demo). */
  forged: boolean;
  roundTripMs: number;
  response: Record<string, unknown>;
}

/**
 * Moves bytes to a device. Deliberately knows NOTHING about keys: a
 * transport can't weaken the security model because it never sees it.
 */
export interface DeviceTransport {
  readonly kind: TransportKind;
  readonly label: string;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Ask the device for a fresh single-use nonce (hex). */
  requestNonce(): Promise<string>;
  /** Deliver a command; `auth` is null only in unsecured learning mode. */
  sendCommand(command: string, auth: AuthTag | null): Promise<DeviceReply>;
}

/** Produces the MIC for a command. Implementations hold (or reach) the key. */
export interface CommandSigner {
  sign(nonce: string, command: string): Promise<string>;
}

/** What application code (panels, screens, node graphs) actually calls. */
export interface CommandChannel {
  readonly kind: TransportKind;
  readonly label: string;
  execute(command: string, options?: { forge?: boolean }): Promise<CommandResult>;
}

/** A command the device understands. Kept in one place so every client
 *  (desktop panel, phone app, node graph) offers the same vocabulary. */
export const DEVICE_COMMANDS = {
  ledOn: "led:on",
  ledOff: "led:off",
  ledToggle: "led:toggle",
  ledBlink: "led:blink",
  info: "info",
  selfTest: "test",
  echo: (text: string) => `echo:${text}`,
} as const;
