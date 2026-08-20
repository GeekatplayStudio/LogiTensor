import type { AuthTag, DeviceReply, DeviceTransport } from "./types";

// WiFi transport: the device's HTTP API. Bytes only — never sees a key.

export class WifiTransport implements DeviceTransport {
  readonly kind = "wifi" as const;
  private reachable = false;

  constructor(private readonly ip: string, private readonly timeoutMs = 6000) {}

  get label(): string {
    return `WiFi ${this.ip}`;
  }

  get connected(): boolean {
    return this.reachable;
  }

  private async getJson(path: string): Promise<DeviceReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`http://${this.ip}${path}`, { signal: controller.signal });
      return { body: await res.json(), status: res.status };
    } finally {
      clearTimeout(timer);
    }
  }

  async connect(): Promise<void> {
    await this.getJson("/");
    this.reachable = true;
  }

  async disconnect(): Promise<void> {
    this.reachable = false;
  }

  async requestNonce(): Promise<string> {
    const { body } = await this.getJson("/auth/nonce");
    if (typeof body?.nonce !== "string") throw new Error("device did not issue a nonce");
    return body.nonce;
  }

  async sendCommand(command: string, auth: AuthTag | null): Promise<DeviceReply> {
    let path = `/cmd?c=${encodeURIComponent(command)}`;
    if (auth) path += `&n=${encodeURIComponent(auth.nonce)}&m=${encodeURIComponent(auth.mic)}`;
    return this.getJson(path);
  }
}
