"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import Link from "next/link";
import { ArrowLeft, Cpu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logEvent } from "@/lib/debug-log";
import { fetchPorts, type PortInfo, type Uf2Drive } from "@/lib/device-lab/api";
import PortList from "./port-list";
import DeviceCheck from "./device-check";
import ToolchainDoctor from "./toolchain-doctor";
import SerialMonitor from "./serial-monitor";
import CameraTest from "./camera-test";
import FlashWizard from "./flash-wizard";
import SecurePanel from "./secure-panel";
import LessonPanel from "./lesson-panel";

// Device Lab screen shell: left = hardware (ports + toolchain), center =
// serial monitor, right = flash wizard + learning panel. Same glassmorphic
// language as the canvas chrome.

export default function DeviceLabScreen() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [uf2Drives, setUf2Drives] = useState<Uf2Drive[]>([]);
  const [portsError, setPortsError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [autoSelect, setAutoSelect] = useState(true);
  // Ports seen in the previous poll — a device is "new" only relative to
  // this, so already-connected boards don't steal the selection on load.
  const knownPorts = useRef<Set<string> | null>(null);

  const refreshPorts = useCallback(async () => {
    try {
      const result = await fetchPorts();
      setPorts(result.ports);
      setUf2Drives(result.uf2Drives);
      setPortsError(null);

      const current = new Set(result.ports.map((p) => p.device));
      const previous = knownPorts.current;
      knownPorts.current = current;
      if (autoSelect && previous) {
        const fresh = result.ports.find((p) => !previous.has(p.device));
        if (fresh) {
          const store = useNodeEditorStore.getState();
          store.setDevicePort(fresh.device);
          // Native-USB Espressif (VID 0x303A) is an S3/C3/C6-class chip;
          // bridge chips (CP210x/CH340/FTDI) are usually classic ESP32.
          store.setDeviceBoard(fresh.vid === 0x303a ? "esp32s3" : "esp32");
          toast.success(`Device plugged in: ${fresh.device} selected`, {
            description: fresh.boardGuess ?? fresh.description,
          });
        }
      }
    } catch (err) {
      setPortsError(err instanceof Error ? err.message : String(err));
    }
  }, [autoSelect]);

  useEffect(() => {
    logEvent("info", "device", "Device Lab opened");
    // First fetch on the next tick (the linter bans sync setState in effects).
    const kick = setTimeout(refreshPorts, 0);
    const timer = setInterval(refreshPorts, 5000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [refreshPorts]);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden">
      {/* Header */}
      <header className="h-10 flex items-center gap-3 px-3 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md shrink-0">
        <Link href="/">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 bg-transparent border-zinc-800/70 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            title="Back to the board"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#8A9BAD]" />
          <span className="font-extrabold text-sm uppercase tracking-wider text-zinc-100">
            Device Lab
          </span>
          <span className="text-[10px] text-zinc-500 hidden sm:inline">
            build · flash · monitor · learn
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none" title="Select a board automatically the moment it is plugged into USB">
            <input
              type="checkbox"
              checked={autoSelect}
              onChange={(e) => setAutoSelect(e.target.checked)}
              className="accent-[#8A9BAD] cursor-pointer"
            />
            Auto-select on plug-in
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refreshPorts();
              setRefreshTick((t) => t + 1);
            }}
            className="h-7 px-2 bg-transparent border-zinc-800/70 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            title="Refresh ports and toolchain"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left: hardware */}
        <aside className="w-72 shrink-0 border-r border-zinc-900 flex flex-col min-h-0 overflow-y-auto p-3 gap-3">
          <ToolchainDoctor refreshTick={refreshTick} />
          <PortList ports={ports} uf2Drives={uf2Drives} error={portsError} />
          <DeviceCheck />
        </aside>

        {/* Center: serial monitor */}
        <main className="flex-1 min-w-0 flex flex-col p-3 overflow-y-auto">
          <SerialMonitor />
          <CameraTest />
        </main>

        {/* Right: flash wizard + lessons */}
        <aside className="w-96 shrink-0 border-l border-zinc-900 flex flex-col min-h-0 overflow-y-auto p-3 gap-3">
          <FlashWizard ports={ports} />
          <SecurePanel />
          <LessonPanel />
        </aside>
      </div>
    </div>
  );
}
