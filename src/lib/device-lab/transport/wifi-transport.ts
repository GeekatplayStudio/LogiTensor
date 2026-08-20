import type { AuthTag, DeviceReply, DeviceTransport } from "./types";

// WiFi transport: the device's HTTP API.
//   GET /auth/nonce                    -> {"nonce":"<32 hex>"}
//   GET /cmd?c=<cmd>&n=<nonce>&m=<mic> -> command result JSON (401 if unsigned)
//
// Moves bytes only — it never sees the device key (see types.ts).

const DEFAULT_TIMEOUT_MS = 6000;

export class WifiTransport implements DeviceTransport {
  readonly kind = "wifi" as const;
  private reachable = false;

  constructor(private readonly ip: string, private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!/^[0-9a-zA-Z.\-:]{3,64}$/.test(ip)) throw new Error("invalid device host");
  }

  get label(): string {
    return `WiFi ${this.ip}`;
  }

  get connected(): boolean {
    return this.reachable;
  }

  private async getJson(path: string): Promise<{ body: Record<string, unknown>; status: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`http://${this.ip}${path}`, { signal: controller.signal });
      // The device answers 401 with a JSON error envelope on a bad MIC —
      // that is a valid, meaningful reply, not a transport failure.
      return { body: await res.json(), status: res.status };
    } finally {
      clearTimeout(timer);
    }
  }

  /** WiFi is connectionless: "connecting" means confirming the device answers. */
  async connect(): Promise<void> {
    await this.getJson("/");
    this.reachable = true;
  }

  async disconnect(): Promise<void> {
    this.reachable = false;
  }

  async requestNonce(): Promise<string> {
    const { body } = await this.getJson("/auth/nonce");
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    if (!nonce) throw new Error("device did not issue a nonce");
    return nonce;
  }

  async sendCommand(command: string, auth: AuthTag | null): Promise<DeviceReply> {
    let path = `/cmd?c=${encodeURIComponent(command)}`;
    if (auth) {
      path += `&n=${encodeURIComponent(auth.nonce)}&m=${encodeURIComponent(auth.mic)}`;
    }
    const { body, status } = await this.getJson(path);
    return { body, status };
  }
}
