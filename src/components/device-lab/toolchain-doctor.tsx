"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Stethoscope } from "lucide-react";
import { fetchToolchain, type ToolchainStatus } from "@/lib/device-lab/api";

// Toolchain doctor card: arduino-cli / ESP32 core / esptool status with
// install guidance. Check-only — installs stay a deliberate user action.

function Row({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      )}
      <span className="text-[11px] font-medium text-zinc-300">{label}</span>
      {detail && <span className="text-[10px] text-zinc-500 truncate">{detail}</span>}
    </div>
  );
}

export default function ToolchainDoctor({ refreshTick }: { refreshTick: number }) {
  const [status, setStatus] = useState<ToolchainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "checking…" is derived: nothing fetched yet and no failure recorded.
  const loading = status === null && error === null;

  useEffect(() => {
    let cancelled = false;
    fetchToolchain()
      .then((s) => {
        if (!cancelled) {
          setStatus(s);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Stethoscope className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Toolchain
        </h2>
        {loading && <span className="text-[10px] text-zinc-600">checking…</span>}
      </div>
      {error && (
        <p className="text-[10px] text-red-400">
          Backend unreachable: {error}. Start it with <code className="text-zinc-300">npm run dev</code>.
        </p>
      )}
      {status && (
        <>
          <Row ok={status.arduinoCli.ok} label="arduino-cli" detail={status.arduinoCli.version} />
          <Row ok={status.esp32Core.ok} label="ESP32 board core" detail={status.esp32Core.version} />
          <Row ok={status.esptool.ok} label="esptool" detail={status.esptool.how} />
          {status.guidance.length > 0 && (
            <div className="mt-2 space-y-1">
              {status.guidance.map((hint) => (
                <p key={hint} className="text-[10px] text-amber-300/90 leading-snug">
                  {hint}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
