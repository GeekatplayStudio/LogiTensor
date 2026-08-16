import React from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ListNodeConfig from "./list-node-config";

// Config editors for the nodes added on top of the original library. Lives in
// its own file (rather than node-config-panel.tsx) to keep every module under
// the repo's 500-line guardrail.
export default function ExtraNodeConfig({
  type,
  data,
  onConfigChange,
}: {
  type: string | undefined;
  data: any;
  onConfigChange: (key: string, val: any) => void;
}) {
  return (
    <>
      {type === "sliderInput" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-zinc-400">Value</Label>
            <span className="font-mono text-xs font-bold text-purple-400">
              {data.config?.value ?? 0}
            </span>
          </div>
          <input
            type="range"
            min={data.config?.min ?? 0}
            max={data.config?.max ?? 100}
            step={data.config?.step ?? 1}
            value={data.config?.value ?? 0}
            onChange={(e) => onConfigChange("value", Number(e.target.value))}
            className="w-full accent-[#7C93B5] h-1.5 cursor-pointer"
          />
          <div className="grid grid-cols-3 gap-1">
            {(["min", "max", "step"] as const).map((key) => (
              <div key={key} className="space-y-0.5">
                <Label className="text-[10px] text-zinc-400 capitalize">{key}</Label>
                <Input
                  type="number"
                  value={data.config?.[key] ?? (key === "max" ? 100 : key === "step" ? 1 : 0)}
                  onChange={(e) => onConfigChange(key, e.target.value === "" ? 0 : Number(e.target.value))}
                  className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {type === "textAreaInput" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Text</Label>
          <Textarea
            value={data.config?.value ?? ""}
            onChange={(e) => onConfigChange("value", e.target.value)}
            className="h-24 text-[11px] bg-zinc-950 border-zinc-800 text-zinc-200 scrollbar-thin resize-y"
            placeholder="Multiline text…"
          />
        </div>
      )}

      {type === "betweenNode" && (
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] text-zinc-400">Bounds</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              {(data.config?.inclusive ?? true) ? "Inclusive" : "Exclusive"}
            </span>
            <Switch
              checked={data.config?.inclusive ?? true}
              onCheckedChange={(val) => onConfigChange("inclusive", val)}
            />
          </div>
        </div>
      )}

      {type === "roundToNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Decimal Places</Label>
          <Input
            type="number"
            min={0}
            max={10}
            value={data.config?.decimals ?? 2}
            onChange={(e) => onConfigChange("decimals", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
        </div>
      )}

      {type === "templateNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Template</Label>
          <Input
            type="text"
            value={data.config?.template ?? ""}
            onChange={(e) => onConfigChange("template", e.target.value)}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 font-mono text-zinc-200"
            placeholder="e.g. Hello {a}, you have {b} messages"
          />
          <p className="text-[9px] text-zinc-600 leading-tight">
            Inputs grow automatically (a, b, c…). Either case works — {"{a}"} and {"{A}"} are the same.
          </p>
        </div>
      )}

      {type === "splitTextNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Split On</Label>
          <Select
            value={data.config?.mode ?? "delimiter"}
            onValueChange={(val) => onConfigChange("mode", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="delimiter">Delimiter</SelectItem>
              <SelectItem value="whitespace">Whitespace (words)</SelectItem>
              <SelectItem value="lines">Lines</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[9px] text-zinc-600 leading-tight">
            Whitespace and Lines ignore the Delimiter input.
          </p>
        </div>
      )}

      {type === "jsonStringifyNode" && (
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] text-zinc-400">Pretty print</span>
          <Switch
            checked={!!data.config?.pretty}
            onCheckedChange={(val) => onConfigChange("pretty", val)}
          />
        </div>
      )}

      {type === "regexMatchNode" && (
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] text-zinc-400">Ignore case</span>
          <Switch
            checked={!!data.config?.ignoreCase}
            onCheckedChange={(val) => onConfigChange("ignoreCase", val)}
          />
        </div>
      )}

      {(type === "toggleNode" || type === "latchNode") && (
        <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
          <span className="text-[10px] text-zinc-400 font-medium">State</span>
          <span
            className={`font-mono text-xs font-bold ${data.config?.state ? "text-emerald-400" : "text-zinc-500"}`}
          >
            {data.config?.state ? "TRUE" : "FALSE"}
          </span>
        </div>
      )}

      {type === "onceNode" && (
        <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
          <span className="text-[10px] text-zinc-400 font-medium">Armed</span>
          <span
            className={`font-mono text-xs font-bold ${data.config?.fired ? "text-zinc-500" : "text-emerald-400"}`}
          >
            {data.config?.fired ? "SPENT" : "READY"}
          </span>
        </div>
      )}

      {type === "sequenceNode" && (
        <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
          <span className="text-[10px] text-zinc-400 font-medium">Next Output</span>
          <span className="font-mono text-xs font-bold text-purple-400">
            Out {(Number(data.config?.step ?? 0) % 3) + 1}
          </span>
        </div>
      )}

      <ListNodeConfig type={type} data={data} onConfigChange={onConfigChange} />
    </>
  );
}
