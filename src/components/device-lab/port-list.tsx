"use client";

import React from "react";
import { Usb, HardDrive } from "lucide-react";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import type { PortInfo, Uf2Drive } from "@/lib/device-lab/api";

// Serial port list (auto-refreshed by the screen shell) + UF2 bootloader
// drives detected for Adafruit/CircuitPython boards.

export default function PortList({
  ports,
  uf2Drives,
  error,
}: {
  ports: PortInfo[];
  uf2Drives: Uf2Drive[];
  error: string | null;
}) {
  const selectedPort = useNodeEditorStore((s) => s.deviceSelectedPort);
  const setDevicePort = useNodeEditorStore((s) => s.setDevicePort);

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Usb className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Ports</h2>
        <span className="text-[10px] text-zinc-600 ml-auto">{ports.length}</span>
      </div>

      {error && <p className="text-[10px] text-red-400">{error}</p>}
      {!error && ports.length === 0 && (
        <p className="text-[10px] text-zinc-500 leading-snug">
          No serial ports. Plug in a board — if it still doesn&apos;t appear, the USB bridge
          driver (CP210x/CH340) may be missing or the cable is power-only.
        </p>
      )}

      <div className="space-y-1">
        {ports.map((port) => (
          <button
            key={port.device}
            onClick={() => setDevicePort(port.device)}
            className={`w-full text-left rounded-md border px-2 py-1.5 cursor-pointer transition-all ${
              selectedPort === port.device
                ? "border-[#8A9BAD] bg-[#8A9BAD]/10 shadow-[0_0_8px_rgba(138,155,173,0.25)]"
                : "border-zinc-800/70 hover:border-zinc-700 bg-zinc-900/40"
            }`}
          >
            <div className="text-[11px] font-mono font-bold text-zinc-200">{port.device}</div>
            <div className="text-[10px] text-zinc-500 truncate">{port.description}</div>
            {port.boardGuess && (
              <div className="text-[10px] text-emerald-400/80">{port.boardGuess}</div>
            )}
          </button>
        ))}
      </div>

      {uf2Drives.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-3.5 h-3.5 text-amber-300" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              UF2 bootloader drives
            </h3>
          </div>
          {uf2Drives.map((drive) => (
            <div
              key={drive.root}
              className="rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 mb-1"
            >
              <div className="text-[11px] font-mono text-zinc-200">
                {drive.root} · {drive.boardId}
              </div>
              <p className="text-[10px] text-zinc-400 leading-snug">{drive.guidance}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
