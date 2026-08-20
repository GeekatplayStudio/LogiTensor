"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal, Plug, PlugZap, Eraser, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import {
  closeMonitor,
  monitorWsUrl,
  openMonitor,
  sendMonitorLine,
} from "@/lib/device-lab/api";

// Serial monitor: opens a backend monitor session on the selected port and
// streams its lines over WebSocket into the store's per-port ring buffer
// (so captured output survives navigating back to the canvas). Multiple
// ports can hold sessions at once; this view shows the selected one.

const BAUDS = [9600, 57600, 115200, 230400, 460800, 921600];

export default function SerialMonitor() {
  const selectedPort = useNodeEditorStore((s) => s.deviceSelectedPort);
  const monitors = useNodeEditorStore((s) => s.deviceMonitors);
  const setDeviceMonitorOpen = useNodeEditorStore((s) => s.setDeviceMonitorOpen);
  const appendDeviceMonitorLines = useNodeEditorStore((s) => s.appendDeviceMonitorLines);
  const clearDeviceMonitor = useNodeEditorStore((s) => s.clearDeviceMonitor);

  const [baud, setBaud] = useState(115200);
  const [outgoing, setOutgoing] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const monitor = selectedPort ? monitors[selectedPort] : undefined;
  const isOpen = Boolean(monitor?.open);
  const lines = monitor?.lines ?? [];

  // Autoscroll on new output.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines.length]);

  // Close any live socket when the component unmounts or the port changes.
  useEffect(
    () => () => {
      wsRef.current?.close();
      wsRef.current = null;
    },
    [selectedPort]
  );

  const connect = async () => {
    if (!selectedPort) return;
    try {
      await openMonitor(selectedPort, baud);
      setDeviceMonitorOpen(selectedPort, baud, true);
      const ws = new WebSocket(monitorWsUrl(selectedPort));
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data.lines)) {
            appendDeviceMonitorLines(selectedPort, data.lines.map((l: any) => l.text));
          }
        } catch {
          // non-JSON frame — ignore
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };
      wsRef.current = ws;
      toast.success(`Monitor open: ${selectedPort} @ ${baud}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const disconnect = async () => {
    if (!selectedPort) return;
    wsRef.current?.close();
    wsRef.current = null;
    try {
      await closeMonitor(selectedPort);
    } finally {
      setDeviceMonitorOpen(selectedPort, baud, false);
    }
  };

  const send = async () => {
    if (!selectedPort || outgoing === "") return;
    try {
      await sendMonitorLine(selectedPort, outgoing);
      appendDeviceMonitorLines(selectedPort, [`> ${outgoing}`]);
      setOutgoing("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="flex-1 min-h-0 flex flex-col rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg">
      {/* Monitor header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-900">
        <Terminal className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Serial monitor
        </h2>
        <span className="text-[11px] font-mono text-zinc-300">
          {selectedPort ?? "no port selected"}
        </span>
        <select
          value={baud}
          onChange={(e) => setBaud(Number(e.target.value))}
          disabled={isOpen}
          className="ml-auto h-6 text-[11px] bg-zinc-950 border border-zinc-800 rounded px-1 text-zinc-300 cursor-pointer disabled:opacity-50"
        >
          {BAUDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        {isOpen ? (
          <Button variant="outline" size="sm" onClick={disconnect} className="h-6 px-2 text-[10px] border-zinc-800 text-emerald-300 hover:bg-zinc-800" title="Close the monitor">
            <PlugZap className="w-3 h-3 mr-1" /> Connected
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={connect} disabled={!selectedPort} className="h-6 px-2 text-[10px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Open a monitor on the selected port">
            <Plug className="w-3 h-3 mr-1" /> Connect
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => selectedPort && clearDeviceMonitor(selectedPort)} disabled={!selectedPort} className="h-6 w-6 p-0 border-zinc-800 text-zinc-500 hover:bg-zinc-800" title="Clear output">
          <Eraser className="w-3 h-3" />
        </Button>
      </div>

      {/* Output */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-300">
        {lines.length === 0 && (
          <p className="text-zinc-600">
            {selectedPort
              ? "No output yet — connect and the board's serial prints stream here."
              : "Select a port on the left, then connect."}
          </p>
        )}
        {lines.map((line, i) => (
          <div key={i} className={line.startsWith("> ") ? "text-sky-300" : undefined}>
            {line}
          </div>
        ))}
      </div>

      {/* Send line + firmware test quick-commands */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-900">
        {(["ping", "info", "test"] as const).map((cmd) => (
          <Button
            key={cmd}
            variant="outline"
            size="sm"
            disabled={!isOpen}
            onClick={async () => {
              if (!selectedPort) return;
              try {
                await sendMonitorLine(selectedPort, cmd);
                appendDeviceMonitorLines(selectedPort, [`> ${cmd}`]);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            }}
            className="h-7 px-2 text-[10px] border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            title={cmd === "ping" ? "Is the firmware alive?" : cmd === "info" ? "Status JSON (IPs, camera)" : "Full self-test (camera frame + WiFi + memory)"}
          >
            {cmd}
          </Button>
        ))}
        <Input
          value={outgoing}
          onChange={(e) => setOutgoing(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={!isOpen}
          placeholder={isOpen ? "Send a line to the device…" : "Connect to send"}
          className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
        />
        <Button variant="outline" size="sm" onClick={send} disabled={!isOpen || outgoing === ""} className="h-7 px-2 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Send">
          <SendHorizonal className="w-3.5 h-3.5" />
        </Button>
      </div>
    </section>
  );
}
