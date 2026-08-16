import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Config editor for the Range node — split out of node-config-panel.tsx to
// keep that file under the repo's module size guardrail.
export default function RangeNodeConfig({
  data,
  onConfigChange,
}: {
  data: any;
  onConfigChange: (key: string, val: any) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
        <span className="text-[10px] text-zinc-400 font-medium">Current Count</span>
        <span className="font-mono text-xs font-bold text-purple-400">
          {data.config?.count ?? 0}
        </span>
      </div>
      <Label className="text-[10px] text-zinc-400">Min</Label>
      <Input
        type="number"
        value={data.config?.min ?? 0}
        onChange={(e) => onConfigChange("min", e.target.value === "" ? 0 : Number(e.target.value))}
        className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
      />
      <Label className="text-[10px] text-zinc-400">Max</Label>
      <Input
        type="number"
        value={data.config?.max ?? 10}
        onChange={(e) => onConfigChange("max", e.target.value === "" ? 0 : Number(e.target.value))}
        className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
      />
      <Label className="text-[10px] text-zinc-400">Initial Count</Label>
      <Input
        type="number"
        value={data.config?.initialCount ?? 0}
        onChange={(e) => onConfigChange("initialCount", e.target.value === "" ? 0 : Number(e.target.value))}
        className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
      />
    </div>
  );
}
