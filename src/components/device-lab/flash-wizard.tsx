"use client";

import React, { useEffect, useState } from "react";
import { Flame, Hammer, FileCode2, Eye, EyeOff, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logEvent } from "@/lib/debug-log";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import { generateFirmwareSketch } from "@/lib/device-lab/firmware-codegen";
import {
  buildDownloadUrl,
  fetchBoards,
  fetchDeviceKeys,
  pollJob,
  readDownloadUrl,
  startBuild,
  startFlash,
  startRead,
  type BoardInfo,
  type PortInfo,
} from "@/lib/device-lab/api";

// Flash wizard: board → source (hello-world | current graph) → build →
// flash. WiFi credentials for graph firmware travel as compile-time defines
// (never written into the sketch or echoed in logs).

type Source = "hello" | "generated" | "esp32video";

// -DCAMERA_MODEL_x selects the pin map in firmware/esp32video/camera_pins.h;
// AI-Thinker is the header's default so it needs no define.
const CAMERA_MODELS: { id: string; label: string; define: string | null; board: string }[] = [
  { id: "ai_thinker", label: "AI-Thinker ESP32-CAM (default)", define: null, board: "esp32cam" },
  { id: "xiao_s3", label: "Seeed XIAO ESP32S3 Sense (native USB)", define: "CAMERA_MODEL_XIAO_ESP32S3", board: "esp32s3camusb" },
  { id: "freenove_s3", label: "Freenove ESP32-S3 CAM (UART bridge)", define: "CAMERA_MODEL_ESP32S3_EYE", board: "esp32s3cam" },
  { id: "s3_eye", label: "ESP32-S3-EYE (native USB)", define: "CAMERA_MODEL_ESP32S3_EYE", board: "esp32s3camusb" },
  { id: "wrover", label: "ESP-WROVER-KIT", define: "CAMERA_MODEL_WROVER_KIT", board: "esp32cam" },
];

export default function FlashWizard({ ports }: { ports: PortInfo[] }) {
  const boardId = useNodeEditorStore((s) => s.deviceSelectedBoardId);
  const setDeviceBoard = useNodeEditorStore((s) => s.setDeviceBoard);
  const selectedPort = useNodeEditorStore((s) => s.deviceSelectedPort);
  const lastBuildId = useNodeEditorStore((s) => s.deviceLastBuildId);
  const setDeviceLastBuildId = useNodeEditorStore((s) => s.setDeviceLastBuildId);

  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [source, setSource] = useState<Source>("hello");
  const [cameraModel, setCameraModel] = useState("ai_thinker");
  const [deviceKeyIds, setDeviceKeyIds] = useState<string[]>([]);
  const [deviceKeyId, setDeviceKeyId] = useState("");
  const [mode, setMode] = useState<"merged" | "app">("merged");
  const [ssid, setSsid] = useState("");
  const [psk, setPsk] = useState("");
  const [showPsk, setShowPsk] = useState(false);
  const [busy, setBusy] = useState<"build" | "flash" | "sync" | "read" | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [lastReadId, setLastReadId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchBoards()
      .then((r) => setBoards(r.boards))
      .catch(() => setBoards([]));
    fetchDeviceKeys()
      .then((r) => setDeviceKeyIds(r.deviceIds))
      .catch(() => setDeviceKeyIds([]));
  }, []);

  const graphState = () => {
    const { nodes, edges } = useNodeEditorStore.getState();
    return generateFirmwareSketch(nodes, edges);
  };

  // Generated graphs with a WiFi Connect node need credentials to bake in;
  // the camera firmware can OPTIONALLY also join your home network (AP+STA).
  const needsWifi = (source === "generated" && graphNeedsWifi()) || source === "esp32video";

  function graphNeedsWifi(): boolean {
    return useNodeEditorStore.getState().nodes.some((n) => n.type === "wifiConnect");
  }

  const showPreview = () => {
    const fw = graphState();
    setPreview(fw.code);
    fw.warnings.forEach((w) => toast.warning(w));
  };

  // Core build step, shared by Build and Build & Flash. Returns the buildId
  // on success, null on failure.
  const doBuild = async (): Promise<string | null> => {
    try {
      let code: string | undefined;
      const defines: Record<string, string> = {};
      if (source === "generated") {
        const fw = graphState();
        fw.warnings.forEach((w) => logEvent("warn", "device", w));
        code = fw.code;
        if (fw.needsWifiDefines) {
          defines.WIFI_SSID = ssid;
          defines.WIFI_PSK = psk;
        }
      } else if (source === "esp32video") {
        const model = CAMERA_MODELS.find((m) => m.id === cameraModel);
        if (model?.define) defines[model.define] = "1";
        // Optional home-network join; the esp32video AP stays up regardless.
        if (ssid.trim() !== "") {
          defines.STA_SSID = ssid;
          defines.STA_PSK = psk;
        }
      }
      const { jobId, buildId } = await startBuild(
        boardId,
        { kind: source, code },
        defines,
        source === "esp32video" && deviceKeyId ? deviceKeyId : undefined
      );
      logEvent("info", "device", `Build started (${boardId}, ${source})`, `buildId ${buildId}`);
      const job = await pollJob(jobId, (j) => setLog((prev) => [...prev, ...j.lines].slice(-200)));
      if (job.status === "ok") {
        setDeviceLastBuildId(buildId);
        return buildId;
      }
      toast.error(`Build ${job.status} (exit ${job.exitCode})`);
      return null;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  // Core flash step. Returns true on success.
  const doFlash = async (buildId: string): Promise<boolean> => {
    if (!selectedPort) return false;
    try {
      const { jobId } = await startFlash(buildId, selectedPort, 460800, mode);
      logEvent("info", "device", `Flash started on ${selectedPort} (${mode})`);
      const job = await pollJob(jobId, (j) => setLog((prev) => [...prev, ...j.lines].slice(-200)));
      if (job.status === "ok") return true;
      toast.error(`Flash ${job.status} (exit ${job.exitCode})`);
      return false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const runBuild = async () => {
    setBusy("build");
    setLog([]);
    if (await doBuild()) toast.success("Build succeeded — ready to flash");
    setBusy(null);
  };

  const runFlash = async () => {
    if (!lastBuildId || !selectedPort) return;
    setBusy("flash");
    setLog([]);
    if (await doFlash(lastBuildId)) toast.success("Flashed — open the monitor to see it run");
    setBusy(null);
  };

  // One-click sync: compile the selected source and put it on the board.
  const runSync = async () => {
    if (!selectedPort) return;
    setBusy("sync");
    setLog([]);
    const buildId = await doBuild();
    if (buildId && (await doFlash(buildId))) {
      toast.success("Device synced — firmware built and flashed");
    }
    setBusy(null);
  };

  // Load (back up) the device's current firmware into a downloadable .bin.
  const runRead = async () => {
    if (!selectedPort) return;
    setBusy("read");
    setLog([]);
    setLastReadId(null);
    try {
      const board = boards.find((b) => b.id === boardId);
      const { jobId, readId } = await startRead(selectedPort, board?.chip ?? "esp32", 460800, 4);
      logEvent("info", "device", `Firmware read started on ${selectedPort}`);
      const job = await pollJob(jobId, (j) => setLog((prev) => [...prev, ...j.lines].slice(-200)));
      if (job.status === "ok") {
        setLastReadId(readId);
        toast.success("Firmware loaded from device — download below");
      } else {
        toast.error(`Read ${job.status} (exit ${job.exitCode})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const selectCls =
    "w-full h-7 text-[11px] bg-zinc-950 border border-zinc-800 rounded px-1 text-zinc-300 cursor-pointer";

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Flame className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Build &amp; flash
        </h2>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-zinc-500">Board</label>
          <select value={boardId} onChange={(e) => setDeviceBoard(e.target.value)} className={selectCls}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            {boards.length === 0 && <option value="esp32">ESP32 (backend offline)</option>}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500">Firmware source</label>
          <select value={source} onChange={(e) => setSource(e.target.value as Source)} className={selectCls}>
            <option value="hello">Hello World (prints over serial)</option>
            <option value="generated">Current graph (canvas → firmware)</option>
            <option value="esp32video">ESP32 Camera — WiFi AP + BLE + video stream</option>
          </select>
        </div>

        {source === "esp32video" && (
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/40 p-2 space-y-1.5">
            <p className="text-[10px] text-zinc-400 leading-snug">
              Creates WiFi network <span className="font-mono text-emerald-300">esp32video</span> (password{" "}
              <span className="font-mono text-emerald-300">testESP32</span>), streams MJPEG at{" "}
              <span className="font-mono">http://192.168.4.1/stream</span> and advertises over BLE.
            </p>
            <label className="text-[10px] text-zinc-500">Camera board</label>
            <select
              value={cameraModel}
              onChange={(e) => {
                setCameraModel(e.target.value);
                const model = CAMERA_MODELS.find((m) => m.id === e.target.value);
                if (model) setDeviceBoard(model.board);
              }}
              className={selectCls}
            >
              {CAMERA_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <label className="text-[10px] text-zinc-500">Device key (Secure commands panel)</label>
            <select value={deviceKeyId} onChange={(e) => setDeviceKeyId(e.target.value)} className={selectCls}>
              <option value="">— learning mode: commands open —</option>
              {deviceKeyIds.map((id) => (
                <option key={id} value={id}>
                  {id} — network commands require HMAC
                </option>
              ))}
            </select>
          </div>
        )}

        {source === "generated" && (
          <Button variant="outline" size="sm" onClick={showPreview} className="h-6 w-full text-[10px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <FileCode2 className="w-3 h-3 mr-1" /> Preview generated sketch
          </Button>
        )}

        {needsWifi && (
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/40 p-2 space-y-1.5">
            <p className="text-[10px] text-zinc-500 leading-snug">
              {source === "esp32video"
                ? "Optional: also join your home WiFi (leave empty for AP-only). Baked in at compile time — never stored in the sketch or logs."
                : "WiFi credentials are baked in at compile time — never stored in the sketch or logs."}
            </p>
            <Input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder={source === "esp32video" ? "Home WiFi SSID (optional)" : "WiFi SSID"} className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200" />
            <div className="flex gap-1">
              <Input
                type={showPsk ? "text" : "password"}
                value={psk}
                onChange={(e) => setPsk(e.target.value)}
                placeholder="WiFi password (8+ chars)"
                className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
              />
              <Button variant="outline" size="sm" onClick={() => setShowPsk((v) => !v)} className="h-7 w-7 p-0 border-zinc-800 text-zinc-500" title={showPsk ? "Hide" : "Show"}>
                {showPsk ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        )}

        <div>
          <label className="text-[10px] text-zinc-500">Flash mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as "merged" | "app")} className={selectCls}>
            <option value="merged">merged @0x0 — first flash / fresh board</option>
            <option value="app">app @0x10000 — faster, board already provisioned</option>
          </select>
        </div>

        <div className="flex gap-2">
          <Button onClick={runBuild} disabled={busy !== null} className="h-7 flex-1 text-[11px] bg-[#8A9BAD]/20 border border-[#8A9BAD]/40 text-zinc-100 hover:bg-[#8A9BAD]/30">
            <Hammer className="w-3 h-3 mr-1" /> {busy === "build" ? "Building…" : "Build"}
          </Button>
          <Button
            onClick={runFlash}
            disabled={busy !== null || !lastBuildId || !selectedPort}
            title={!selectedPort ? "Select a port first" : !lastBuildId ? "Build first" : `Flash to ${selectedPort}`}
            className="h-7 flex-1 text-[11px] bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25"
          >
            <Flame className="w-3 h-3 mr-1" /> {busy === "flash" ? "Flashing…" : "Flash"}
          </Button>
        </div>
        <Button
          onClick={runSync}
          disabled={busy !== null || !selectedPort}
          title={selectedPort ? `Build the selected source and flash it to ${selectedPort} in one go` : "Select a port first"}
          className="h-7 w-full text-[11px] bg-sky-500/15 border border-sky-400/30 text-sky-200 hover:bg-sky-500/25"
        >
          <RefreshCw className="w-3 h-3 mr-1" /> {busy === "sync" ? "Syncing…" : "Sync device (build + flash)"}
        </Button>

        <div className="flex items-center gap-2">
          {lastBuildId && (
            <a
              href={buildDownloadUrl(lastBuildId, mode)}
              download
              className="text-[10px] text-sky-300 hover:text-sky-200 underline underline-offset-2"
            >
              Download built .bin ({mode})
            </a>
          )}
          {lastReadId && (
            <a
              href={readDownloadUrl(lastReadId)}
              download
              className="text-[10px] text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
            >
              Download device backup
            </a>
          )}
        </div>

        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/40 p-2 space-y-1">
          <p className="text-[10px] text-zinc-500 leading-snug">
            Load firmware FROM the device: backs up the full 4 MB flash to a .bin you can
            download and re-flash later (mode &quot;merged @0x0&quot;).
          </p>
          <Button
            variant="outline"
            onClick={runRead}
            disabled={busy !== null || !selectedPort}
            className="h-7 w-full text-[11px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Download className="w-3 h-3 mr-1" /> {busy === "read" ? "Reading…" : "Load firmware from device"}
          </Button>
        </div>
        {ports.length === 0 && (
          <p className="text-[10px] text-zinc-600">No board connected — you can still build.</p>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-zinc-950 border border-zinc-900 p-2 font-mono text-[10px] text-zinc-400 leading-relaxed">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {preview !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Generated sketch
            </span>
            <button onClick={() => setPreview(null)} className="text-[10px] text-zinc-500 hover:text-zinc-200 cursor-pointer">
              close
            </button>
          </div>
          <pre className="max-h-48 overflow-auto rounded-md bg-zinc-950 border border-zinc-900 p-2 font-mono text-[10px] text-zinc-300 leading-relaxed whitespace-pre">
            {preview}
          </pre>
        </div>
      )}
    </section>
  );
}
