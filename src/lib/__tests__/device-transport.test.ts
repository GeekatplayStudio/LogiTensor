import { describe, it, expect, vi } from "vitest";
import {
  LocalKeySigner,
  SignedChannel,
  WifiTransport,
  forgeMic,
  isValidDeviceKey,
} from "../device-lab/transport";
import type { AuthTag, DeviceReply, DeviceTransport } from "../device-lab/transport";

// The MIC contract shared by four implementations: the firmware
// (secure_channel.h), the backend (secure_test.py), this desktop signer,
// and the mobile signer. This vector locks them together — if it changes,
// every implementation must change with it.
const KEY = "ab".repeat(32);
const NONCE = "00112233445566778899aabbccddeeff";
// Canonical vector, cross-checked against the Python implementation
// (backend/tests/test_secure_channel.py asserts the same value).
const MIC_LED_TOGGLE = "4203b1a818832089e35a29e17ea510093776f35fe3aaf04ec899796ec3f1ff37";

/** Records what a channel sent, so we can assert on the envelope. */
class FakeTransport implements DeviceTransport {
  readonly kind = "wifi" as const;
  readonly label = "fake";
  connected = true;
  sent: { command: string; auth: AuthTag | null }[] = [];
  nonceCalls = 0;
  constructor(private readonly reply: DeviceReply = { body: { ok: true }, status: 200 }) {}
  async connect() {}
  async disconnect() {}
  async requestNonce() {
    this.nonceCalls++;
    return NONCE;
  }
  async sendCommand(command: string, auth: AuthTag | null) {
    this.sent.push({ command, auth });
    return this.reply;
  }
}

describe("device key validation", () => {
  it("accepts only 256-bit hex keys", () => {
    expect(isValidDeviceKey(KEY)).toBe(true);
    expect(isValidDeviceKey("ab".repeat(16))).toBe(false); // 128-bit
    expect(isValidDeviceKey("zz".repeat(32))).toBe(false); // not hex
    expect(isValidDeviceKey("")).toBe(false);
  });

  it("refuses to build a signer from a bad key", () => {
    expect(() => new LocalKeySigner("nope")).toThrow();
  });
});

describe("command signing", () => {
  it("matches the canonical cross-language vector", async () => {
    // Same key + nonce + command must produce the same MIC in the firmware,
    // the Python backend, this browser signer and the mobile signer.
    expect(await new LocalKeySigner(KEY).sign(NONCE, "led:toggle")).toBe(MIC_LED_TOGGLE);
  });

  it("produces a MIC that depends on both nonce and command", async () => {
    const signer = new LocalKeySigner(KEY);
    const a = await signer.sign(NONCE, "led:toggle");
    const b = await signer.sign(NONCE, "led:on");
    const c = await signer.sign("ff".repeat(16), "led:toggle");
    expect(a).not.toBe(b); // different command
    expect(a).not.toBe(c); // different nonce
  });

  it("forgeMic changes exactly the last character", () => {
    const mic = "a".repeat(64);
    const forged = forgeMic(mic);
    expect(forged).toHaveLength(64);
    expect(forged.slice(0, 63)).toBe(mic.slice(0, 63));
    expect(forged).not.toBe(mic);
  });
});

describe("SignedChannel", () => {
  it("fetches a fresh nonce for EVERY command (replay defence)", async () => {
    const transport = new FakeTransport();
    const channel = new SignedChannel(transport, new LocalKeySigner(KEY));
    await channel.execute("led:on");
    await channel.execute("led:off");
    expect(transport.nonceCalls).toBe(2);
  });

  it("attaches nonce + MIC to the command", async () => {
    const transport = new FakeTransport();
    const channel = new SignedChannel(transport, new LocalKeySigner(KEY));
    const result = await channel.execute("led:toggle");
    expect(transport.sent[0].auth?.nonce).toBe(NONCE);
    expect(transport.sent[0].auth?.mic).toMatch(/^[0-9a-f]{64}$/);
    expect(result.ok).toBe(true);
    expect(result.forged).toBe(false);
  });

  it("sends a corrupted MIC when forging, and reports rejection", async () => {
    const rejecting = new FakeTransport({
      body: { ok: false, error: "auth failed" },
      status: 401,
    });
    const channel = new SignedChannel(rejecting, new LocalKeySigner(KEY));
    const good = await new LocalKeySigner(KEY).sign(NONCE, "led:toggle");
    const result = await channel.execute("led:toggle", { forge: true });
    expect(rejecting.sent[0].auth?.mic).not.toBe(good);
    expect(result.ok).toBe(false);
    expect(result.forged).toBe(true);
  });

  it("sends no auth at all in learning mode (no signer)", async () => {
    const transport = new FakeTransport();
    const channel = new SignedChannel(transport, null);
    await channel.execute("info");
    expect(transport.sent[0].auth).toBeNull();
    expect(transport.nonceCalls).toBe(0);
  });

  it("treats HTTP 401 as a failed command even if the body looks fine", async () => {
    const transport = new FakeTransport({ body: {}, status: 401 });
    const channel = new SignedChannel(transport, new LocalKeySigner(KEY));
    expect((await channel.execute("led:on")).ok).toBe(false);
  });
});

describe("WifiTransport", () => {
  it("rejects a malformed host instead of building a bad URL", () => {
    expect(() => new WifiTransport("not a host!! /../")).toThrow();
  });

  it("builds the signed /cmd URL the firmware expects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = new WifiTransport("192.168.4.1");
    await transport.sendCommand("echo:hi there", { nonce: NONCE, mic: "ff".repeat(32) });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("http://192.168.4.1/cmd?c=echo%3Ahi%20there");
    expect(url).toContain(`n=${NONCE}`);
    expect(url).toContain("m=" + "ff".repeat(32));
    vi.unstubAllGlobals();
  });
});
