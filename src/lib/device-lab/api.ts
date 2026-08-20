"use client";

// Typed client for the Device Lab backend (backend/devicelab/routes.py).

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface PortInfo {
  device: string;
  description: string;
  vid: number | null;
  pid: number | null;
  serialNumber: string | null;
  boardGuess: string | null;
}

export interface Uf2Drive {
  root: string;
  boardId: string;
  model: string;
  guidance: string;
}

export interface ToolchainStatus {
  arduinoCli: { ok: boolean; path: string | null; version: string | null };
  esp32Core: { ok: boolean; version: string | null };
  esptool: { ok: boolean; how: string | null };
  ready: boolean;
  guidance: string[];
}

export interface BoardInfo {
  id: string;
  label: string;
  chip: string;
}

export interface DeviceJob {
  id: string;
  kind: "build" | "flash";
  status: "queued" | "running" | "ok" | "error" | "cancelled";
  exitCode: number | null;
  lineCount: number;
  lines: string[];
  result: Record<string, any>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const fetchPorts = () =>
  request<{ ports: PortInfo[]; uf2Drives: Uf2Drive[] }>("/devicelab/ports");

export const fetchToolchain = () => request<ToolchainStatus>("/devicelab/toolchain");

export const fetchBoards = () => request<{ boards: BoardInfo[] }>("/devicelab/boards");

export type BuildSourceKind = "hello" | "generated" | "esp32video";

export const startBuild = (
  boardId: string,
  source: { kind: BuildSourceKind; code?: string },
  defines: Record<string, string> = {},
  deviceKeyId?: string
) =>
  request<{ jobId: string; buildId: string }>("/devicelab/build", {
    method: "POST",
    body: JSON.stringify({ boardId, source, defines, deviceKeyId: deviceKeyId ?? null }),
  });

// --- secured command channel -------------------------------------------

export const fetchDeviceKeys = () => request<{ deviceIds: string[] }>("/devicelab/keys");

/** Creates (or returns) a device key — shown once for pairing the phone app. */
export const generateDeviceKey = (deviceId: string) =>
  request<{ deviceId: string; key: string }>("/devicelab/keys/generate", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });

export interface SecureTestResult {
  command: string;
  forged: boolean;
  status: number;
  response: Record<string, any>;
  roundTripMs: number;
}

/** Authenticated command over WiFi; the key stays on the backend. */
export const secureTest = (ip: string, deviceId: string, command: string, forge = false) =>
  request<SecureTestResult>("/devicelab/secure/test", {
    method: "POST",
    body: JSON.stringify({ ip, deviceId, command, forge }),
  });

export const startFlash = (buildId: string, port: string, baud: number, mode: "merged" | "app") =>
  request<{ jobId: string }>("/devicelab/flash", {
    method: "POST",
    body: JSON.stringify({ buildId, port, baud, mode }),
  });

/** Chip-level identification (esptool flash_id) — returns a pollable job. */
export const startIdentify = (port: string, baud = 115200) =>
  request<{ jobId: string }>("/devicelab/identify", {
    method: "POST",
    body: JSON.stringify({ port, baud }),
  });

export interface ProbeResult {
  port: string;
  command: string;
  lines: string[];
  replied: boolean;
}

/** Ask the running firmware over serial: ping | info | test. */
export const probeFirmware = (port: string, command: "ping" | "info" | "test", baud = 115200) =>
  request<ProbeResult>("/devicelab/probe", {
    method: "POST",
    body: JSON.stringify({ port, baud, command }),
  });

/** Read (back up) the device's flash into a downloadable .bin. */
export const startRead = (port: string, chip: string, baud: number, sizeMb: number) =>
  request<{ jobId: string; readId: string }>("/devicelab/read", {
    method: "POST",
    body: JSON.stringify({ port, chip, baud, sizeMb }),
  });

export const readDownloadUrl = (readId: string) =>
  `${API_BASE}/devicelab/reads/${readId}/download`;

export const buildDownloadUrl = (buildId: string, mode: "app" | "merged") =>
  `${API_BASE}/devicelab/builds/${buildId}/download?mode=${mode}`;

export const fetchJob = (jobId: string, after = 0) =>
  request<DeviceJob>(`/devicelab/jobs/${jobId}?after=${after}`);

export const openMonitor = (port: string, baud: number) =>
  request<{ port: string; baud: number; open: boolean }>("/devicelab/monitor/open", {
    method: "POST",
    body: JSON.stringify({ port, baud }),
  });

export const closeMonitor = (port: string) =>
  request<{ closed: boolean }>("/devicelab/monitor/close", {
    method: "POST",
    body: JSON.stringify({ port }),
  });

export const sendMonitorLine = (port: string, text: string, newline = true) =>
  request<{ sent: boolean }>("/devicelab/monitor/send", {
    method: "POST",
    body: JSON.stringify({ port, text, newline }),
  });

/** WebSocket URL streaming a monitor session's lines. */
export const monitorWsUrl = (port: string) =>
  `${API_BASE.replace(/^http/, "ws")}/devicelab/ws/monitor/${encodeURIComponent(port)}`;

/** Polls a job until it leaves the queued/running states. */
export async function pollJob(
  jobId: string,
  onUpdate: (job: DeviceJob) => void,
  intervalMs = 700
): Promise<DeviceJob> {
  let after = 0;
  for (;;) {
    const job = await fetchJob(jobId, after);
    after = job.lineCount;
    onUpdate(job);
    if (job.status !== "queued" && job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
