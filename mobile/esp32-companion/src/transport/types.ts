// Communication abstraction — mirror of the desktop layer in
// src/lib/device-lab/transport/types.ts. Same shapes on purpose: one
// architecture, two runtimes.
//
// SECURITY LIVES ABOVE TRANSPORT. WiFi and Bluetooth are interchangeable
// byte pipes; neither can weaken authentication because neither sees a key.

export type TransportKind = "wifi" | "ble";

export interface AuthTag {
  nonce: string;
  mic: string;
}

export interface DeviceReply {
  body: Record<string, any>;
  status?: number;
}

export interface CommandResult {
  command: string;
  transport: TransportKind;
  ok: boolean;
  roundTripMs: number;
  response: Record<string, any>;
}

export interface DeviceTransport {
  readonly kind: TransportKind;
  readonly label: string;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  requestNonce(): Promise<string>;
  sendCommand(command: string, auth: AuthTag | null): Promise<DeviceReply>;
}

export interface CommandSigner {
  sign(nonce: string, command: string): string;
}

export interface CommandChannel {
  readonly kind: TransportKind;
  readonly label: string;
  execute(command: string): Promise<CommandResult>;
}

/** Shared command vocabulary — identical to the desktop client's. */
export const DEVICE_COMMANDS = {
  ledOn: "led:on",
  ledOff: "led:off",
  ledToggle: "led:toggle",
  ledBlink: "led:blink",
  info: "info",
  selfTest: "test",
  echo: (text: string) => `echo:${text}`,
} as const;
