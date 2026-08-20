"use client";

import React, { useState } from "react";
import { Stethoscope, Cpu, MessageCircleQuestion, HeartPulse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import { pollJob, probeFirmware, startIdentify } from "@/lib/device-lab/api";

// "Is this device actually working?" panel, two layers deep:
//  - Identify chip: esptool flash_id — talks to the ROM bootloader, so it
//    works on ANY ESP32 whatever firmware is on it (chip type, MAC, flash
//    size). The board reboots into its firmware afterwards.
//  - Ask firmware: sends ping / info / test over serial to a RUNNING
//    LogiBoard firmware (esp32video). "test" makes the board grab a real
//    camera frame and report timing, WiFi, and memory health.

interface CameraTestReport {
  ok: boolean;
  frameBytes?: number;
  width?: number;
  height?: number;
  captureMs?: number;
  error?: string;
}

export default function DeviceCheck() {
  const selectedPort = useNodeEditorStore((s) => s.deviceSelectedPort);
  const [busy, setBusy] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);

  const identify = async () => {
    if (!selectedPort) return;
    setBusy("identify");
    setLines([]);
    setVerdict(null);
    try {
      const { jobId } = await startIdentify(selectedPort);
      const job = await pollJob(jobId, () => {});
      // Keep only the informative lines from esptool's output.
      const interesting = job.lines.filter((l) =>
        /chip is|mac|flash|features|crystal/i.test(l)
      );
      setLines(interesting.length ? interesting : job.lines.slice(-8));
      setVerdict(
        job.status === "ok"
          ? "Chip responded — board and USB link are healthy."
          : "Chip did not respond — check the cable, or hold BOOT while starting the check."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const probe = async (command: "ping" | "info" | "test") => {
    if (!selectedPort) return;
    setBusy(command);
    setLines([]);
    setVerdict(null);
    try {
      const result = await probeFirmware(selectedPort, command);
      setLines(result.lines);
      if (!result.replied) {
        setVerdict(
          "No reply — the board may not run LogiBoard firmware yet (flash esp32video first), or it is still booting."
        );
      } else if (command === "test") {
        const jsonLine = result.lines.find((l) => l.startsWith("{"));
        try {
          const report = JSON.parse(jsonLine ?? "");
          const cam: CameraTestReport = report.camera ?? { ok: false };
          setVerdict(
            cam.ok
              ? `WORKING — camera grabbed a ${cam.width}×${cam.height} frame (${cam.frameBytes} bytes in ${cam.captureMs} ms), heap ${Math.round(report.heapFree / 1024)} KB free.`
              : `Firmware alive, but camera FAILED: ${cam.error ?? "unknown"} — check the ribbon cable / camera model setting.`
          );
        } catch {
          setVerdict("Reply received but not parseable — see the raw lines below.");
        }
      } else {
        setVerdict("Firmware replied — device is alive.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "h-6 px-2 text-[10px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100";

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <HeartPulse className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Device check
        </h2>
        <span className="text-[10px] font-mono text-zinc-600 ml-auto">{selectedPort ?? "—"}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <Button variant="outline" size="sm" onClick={identify} disabled={!selectedPort || busy !== null} className={btn} title="esptool flash_id — works with any firmware">
          <Cpu className="w-3 h-3 mr-1" /> {busy === "identify" ? "Asking chip…" : "Identify chip"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => probe("ping")} disabled={!selectedPort || busy !== null} className={btn} title="Is the firmware alive?">
          <MessageCircleQuestion className="w-3 h-3 mr-1" /> Ping
        </Button>
        <Button variant="outline" size="sm" onClick={() => probe("info")} disabled={!selectedPort || busy !== null} className={btn} title="Ask the firmware who it is and its IPs">
          Info
        </Button>
        <Button variant="outline" size="sm" onClick={() => probe("test")} disabled={!selectedPort || busy !== null} className={btn} title="Full self-test: real camera frame grab + WiFi + memory">
          <Stethoscope className="w-3 h-3 mr-1" /> {busy === "test" ? "Testing…" : "Self-test"}
        </Button>
      </div>

      {verdict && (
        <p
          className={`text-[10px] leading-snug mb-1.5 ${
            verdict.startsWith("WORKING") || verdict.includes("healthy") || verdict.includes("alive")
              ? "text-emerald-300"
              : "text-amber-300/90"
          }`}
        >
          {verdict}
        </p>
      )}

      {lines.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-md bg-zinc-950 border border-zinc-900 p-2 font-mono text-[10px] text-zinc-400 leading-relaxed break-all">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </section>
  );
}
