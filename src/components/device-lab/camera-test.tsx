"use client";

import React, { useState } from "react";
import { Camera, Play, Square, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Connection tester for the esp32video camera firmware. The device serves
// CORS-open endpoints: GET /  (status JSON), /capture (JPEG), /stream
// (MJPEG). To reach the default IP 192.168.4.1 this computer must join the
// board's own WiFi network (esp32video / testESP32); if the board also
// joined your home network, use its LAN IP from the serial monitor instead.

interface CamStatus {
  name: string;
  camera: boolean;
  apIp: string;
  staIp: string;
  clients: number;
  rssi: number;
}

export default function CameraTest() {
  const [ip, setIp] = useState("192.168.4.1");
  const [status, setStatus] = useState<CamStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [snapshotTick, setSnapshotTick] = useState(0);
  const [homeSsid, setHomeSsid] = useState("");
  const [homePsk, setHomePsk] = useState("");

  const base = `http://${ip.trim()}`;

  // Runtime provisioning: tells a RUNNING esp32video board to also join
  // your home WiFi (saved on the device, survives reboot). Same command the
  // iPhone app sends over BLE.
  const provision = async () => {
    try {
      const res = await fetch(
        `${base}/wifi?ssid=${encodeURIComponent(homeSsid)}&psk=${encodeURIComponent(homePsk)}`
      );
      const fresh: CamStatus = await res.json();
      setStatus(fresh);
      setError(
        fresh.staIp
          ? null
          : "Board could not join that network — check the credentials; its own AP is still up."
      );
    } catch {
      setError(`No response from ${base} — connect to the board first.`);
    }
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${base}/`, { signal: controller.signal });
      clearTimeout(timer);
      setStatus(await res.json());
    } catch {
      setStatus(null);
      setError(
        `No response from ${base}. Join the "esp32video" WiFi network (password testESP32) on this computer, or use the board's LAN IP from the serial monitor.`
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Camera className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Camera connection test
        </h2>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.4.1"
          className="h-7 w-40 text-xs font-mono bg-zinc-950 border-zinc-800 text-zinc-200"
        />
        <Button variant="outline" size="sm" onClick={check} disabled={checking} className="h-7 px-2 text-[11px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
          <Activity className="w-3 h-3 mr-1" /> {checking ? "Checking…" : "Check"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSnapshotTick((t) => t + 1)} className="h-7 px-2 text-[11px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
          <Camera className="w-3 h-3 mr-1" /> Snapshot
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setError(null);
            try {
              const res = await fetch(`${base}/test`);
              const report = await res.json();
              const cam = report.camera ?? {};
              setError(
                cam.ok
                  ? `Self-test OK: ${cam.width}×${cam.height} frame, ${cam.frameBytes} bytes in ${cam.captureMs} ms, heap ${Math.round(report.heapFree / 1024)} KB free.`
                  : `Self-test: camera FAILED (${cam.error ?? "unknown"}).`
              );
            } catch {
              setError(`No response from ${base}/test — connect to the board's network first.`);
            }
          }}
          className="h-7 px-2 text-[11px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="Run the firmware's self-test over WiFi"
        >
          Self-test
        </Button>
        {streaming ? (
          <Button variant="outline" size="sm" onClick={() => setStreaming(false)} className="h-7 px-2 text-[11px] border-emerald-400/40 text-emerald-300 hover:bg-zinc-800">
            <Square className="w-3 h-3 mr-1" /> Stop stream
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setStreaming(true)} className="h-7 px-2 text-[11px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <Play className="w-3 h-3 mr-1" /> Live stream
          </Button>
        )}
      </div>

      {error && <p className="text-[10px] text-amber-300/90 leading-snug mb-2">{error}</p>}
      {status && (
        <p className="text-[10px] font-mono text-zinc-400 mb-2">
          {status.name} · camera {status.camera ? "OK" : "FAILED"} · AP {status.apIp}
          {status.staIp && ` · LAN ${status.staIp}`} · {status.clients} client(s)
        </p>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Input value={homeSsid} onChange={(e) => setHomeSsid(e.target.value)} placeholder="Home WiFi SSID" className="h-7 w-36 text-xs bg-zinc-950 border-zinc-800 text-zinc-200" />
        <Input type="password" value={homePsk} onChange={(e) => setHomePsk(e.target.value)} placeholder="Password" className="h-7 w-32 text-xs bg-zinc-950 border-zinc-800 text-zinc-200" />
        <Button variant="outline" size="sm" onClick={provision} disabled={homeSsid.trim() === ""} className="h-7 px-2 text-[11px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Tell the running board to also join your home WiFi (no reflash)">
          Join home WiFi
        </Button>
      </div>

      {(streaming || snapshotTick > 0) && (
        <div className="rounded-md border border-zinc-900 bg-black overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- live MJPEG/JPEG from the device, not an optimizable asset */}
          <img
            src={streaming ? `${base}/stream` : `${base}/capture?t=${snapshotTick}`}
            alt={streaming ? "Live MJPEG stream" : "Camera snapshot"}
            className="w-full max-h-96 object-contain"
          />
        </div>
      )}
    </section>
  );
}
