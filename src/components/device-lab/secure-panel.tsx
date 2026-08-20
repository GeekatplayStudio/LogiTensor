"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldX, KeyRound, Lightbulb, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDeviceKeys, generateDeviceKey } from "@/lib/device-lab/api";
import {
  BrokeredChannel,
  DEVICE_COMMANDS,
  type CommandResult,
} from "@/lib/device-lab/transport";

// Secure command lab: provision a device key, run authenticated commands
// (flash the LED, echo data) against the board over WiFi — and deliberately
// send a FORGED command to watch the device reject it. The key itself stays
// in the backend keystore; the browser only names device + command. The
// "Show pairing key" step reveals it once for typing/scanning into the
// phone app.

export default function SecurePanel() {
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [newId, setNewId] = useState("cam-01");
  const [pairingKey, setPairingKey] = useState<string | null>(null);
  const [ip, setIp] = useState("192.168.4.1");
  const [echoText, setEchoText] = useState("hello secure world");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    fetchDeviceKeys()
      .then((r) => {
        setDeviceIds(r.deviceIds);
        if (r.deviceIds.length > 0) setDeviceId((d) => d || r.deviceIds[0]);
      })
      .catch(() => setDeviceIds([]));
  }, []);

  const generate = async () => {
    try {
      const { deviceId: id } = await generateDeviceKey(newId.trim());
      toast.success(`Key ready for ${id}`);
      setDeviceIds((ids) => (ids.includes(id) ? ids : [...ids, id].sort()));
      setDeviceId(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const reveal = async () => {
    if (!deviceId) return;
    const { key } = await generateDeviceKey(deviceId);
    setPairingKey(key);
  };

  const report = (r: CommandResult) => {
    const head = r.forged
      ? r.ok
        ? "⚠ FORGED command was ACCEPTED — security is NOT working"
        : "✓ forged command rejected — security works"
      : r.ok
        ? `✓ ${r.command} executed in ${r.roundTripMs} ms`
        : `✗ ${r.command} failed: ${r.response?.error ?? ""}`;
    setResults((prev) => [head, `  ${JSON.stringify(r.response)}`, ...prev].slice(0, 12));
  };

  const run = async (command: string, forge = false) => {
    if (!deviceId) {
      toast.error("Generate/select a device key first");
      return;
    }
    setBusy(true);
    try {
      // Brokered: the backend holds the key and signs — no secret ever
      // reaches this page's JavaScript.
      const channel = new BrokeredChannel(ip.trim(), deviceId);
      report(await channel.execute(command, { forge }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "h-6 px-2 text-[10px] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100";

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Secure commands
        </h2>
      </div>

      {/* Key provisioning */}
      <div className="rounded-md border border-zinc-800/70 bg-zinc-900/40 p-2 space-y-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="device id (e.g. cam-01)" className="h-6 text-[11px] font-mono bg-zinc-950 border-zinc-800 text-zinc-200" />
          <Button variant="outline" size="sm" onClick={generate} className={btn} title="Create a 256-bit key for this device (kept in the local keystore)">
            <KeyRound className="w-3 h-3 mr-1" /> New key
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="flex-1 h-6 text-[11px] font-mono bg-zinc-950 border border-zinc-800 rounded px-1 text-zinc-300 cursor-pointer">
            <option value="">— no device key —</option>
            {deviceIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={reveal} disabled={!deviceId} className={btn} title="Show the key once, to pair the phone app">
            Show pairing key
          </Button>
        </div>
        {pairingKey && (
          <div className="rounded bg-zinc-950 border border-amber-400/30 p-1.5">
            <p className="text-[9px] text-amber-300/90 mb-0.5">
              Type/scan this into the phone app, then close it. Anyone with this key controls the device.
            </p>
            <code className="text-[9px] font-mono text-zinc-300 break-all">{pairingKey}</code>
            <button onClick={() => setPairingKey(null)} className="block text-[9px] text-zinc-500 hover:text-zinc-200 cursor-pointer mt-0.5">
              hide
            </button>
          </div>
        )}
        <p className="text-[9px] text-zinc-600 leading-snug">
          Bake the key into firmware via the flash wizard&apos;s &quot;Device key&quot; picker, then flash.
        </p>
      </div>

      {/* Command tests */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Input value={ip} onChange={(e) => setIp(e.target.value)} className="h-6 w-32 text-[11px] font-mono bg-zinc-950 border-zinc-800 text-zinc-200" />
        <Button variant="outline" size="sm" onClick={() => run(DEVICE_COMMANDS.ledToggle)} disabled={busy} className={btn} title="Authenticated actuator command">
          <Lightbulb className="w-3 h-3 mr-1" /> LED toggle
        </Button>
        <Button variant="outline" size="sm" onClick={() => run(DEVICE_COMMANDS.ledBlink)} disabled={busy} className={btn}>
          Blink
        </Button>
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Input value={echoText} onChange={(e) => setEchoText(e.target.value)} className="h-6 flex-1 text-[11px] bg-zinc-950 border-zinc-800 text-zinc-200" />
        <Button variant="outline" size="sm" onClick={() => run(DEVICE_COMMANDS.echo(echoText))} disabled={busy} className={btn} title="Send data, get it echoed back with round-trip timing">
          <ArrowLeftRight className="w-3 h-3 mr-1" /> Echo
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={() => run(DEVICE_COMMANDS.ledToggle, true)} disabled={busy} className="h-6 w-full text-[10px] border-red-400/30 text-red-300 hover:bg-red-500/10" title="Sends a command with a corrupted signature — the device must reject it">
        <ShieldX className="w-3 h-3 mr-1" /> Send FORGED command (must be rejected)
      </Button>

      {results.length > 0 && (
        <div className="mt-2 max-h-36 overflow-y-auto rounded-md bg-zinc-950 border border-zinc-900 p-2 font-mono text-[9px] text-zinc-400 leading-relaxed break-all whitespace-pre-wrap">
          {results.join("\n")}
        </div>
      )}
    </section>
  );
}
