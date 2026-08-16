import React from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toList, toNum, toStr } from "@/lib/node-value-utils";

const inputCls = "h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200";

/** Scrollable readout of an accumulated list, with a Clear action — the same
 * shape the Console Logger uses for its logs. */
function AccumulatedList({
  items,
  onClear,
  emptyHint,
}: {
  items: any[];
  onClear: () => void;
  emptyHint: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <Label className="text-[10px] text-zinc-400">Collected ({items.length})</Label>
        <button
          onClick={onClear}
          className="text-[9px] hover:text-red-400 text-zinc-500 transition"
        >
          Clear
        </button>
      </div>
      <div className="max-h-20 overflow-y-auto bg-zinc-950 border border-zinc-900 rounded p-1.5 font-mono text-[9px] text-zinc-400 scrollbar-thin">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <div key={idx} className="border-b border-zinc-900/40 py-0.5 leading-tight">
              {toStr(item)}
            </div>
          ))
        ) : (
          <div className="text-zinc-600 italic">{emptyHint}</div>
        )}
      </div>
    </div>
  );
}

// Config editors for the Lists category plus the accumulating/display output
// nodes. Split from extra-node-config.tsx for the 500-line module guardrail.
export default function ListNodeConfig({
  type,
  data,
  onConfigChange,
}: {
  type: string | undefined;
  data: any;
  onConfigChange: (key: string, val: any) => void;
}) {
  const gaugeMin = toNum(data.config?.min, 0);
  const gaugeMax = toNum(data.config?.max, 100);
  const gaugeValue = toNum(data.inputs?.find((i: any) => i.id === "value")?.value);
  const gaugePercent =
    gaugeMax === gaugeMin
      ? 0
      : Math.min(100, Math.max(0, ((gaugeValue - gaugeMin) / (gaugeMax - gaugeMin)) * 100));

  return (
    <>
      {type === "listAppendNode" && (
        <AccumulatedList
          items={toList(data.config?.items)}
          onClear={() => onConfigChange("items", [])}
          emptyHint="Empty. Fire Append to collect."
        />
      )}

      {type === "valueListNode" && (
        <AccumulatedList
          items={toList(data.config?.values)}
          onClear={() => onConfigChange("values", [])}
          emptyHint="No values yet. Run trigger."
        />
      )}

      {type === "listStatsNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Aggregate</Label>
          <Select value={data.config?.op ?? "sum"} onValueChange={(val) => onConfigChange("op", val)}>
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select aggregate" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="avg">Average</SelectItem>
              <SelectItem value="min">Minimum</SelectItem>
              <SelectItem value="max">Maximum</SelectItem>
              <SelectItem value="count">Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {type === "listSortNode" && (
        <div className="space-y-1.5">
          <Label className="text-[10px] text-zinc-400">Direction</Label>
          <Select
            value={data.config?.direction ?? "asc"}
            onValueChange={(val) => onConfigChange("direction", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select direction" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[10px] text-zinc-400">
              {(data.config?.numeric ?? true) ? "Numeric compare" : "Text compare"}
            </span>
            <Switch
              checked={data.config?.numeric ?? true}
              onCheckedChange={(val) => onConfigChange("numeric", val)}
            />
          </div>
        </div>
      )}

      {type === "gaugeNode" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-medium">Reading</span>
            <span className="font-mono text-xs font-bold text-purple-400">{gaugeValue}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
            <div
              className="h-full bg-[#AD8288] transition-all duration-300"
              style={{ width: `${gaugePercent}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-zinc-400">Min</Label>
              <Input
                type="number"
                value={data.config?.min ?? 0}
                onChange={(e) => onConfigChange("min", e.target.value === "" ? 0 : Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-zinc-400">Max</Label>
              <Input
                type="number"
                value={data.config?.max ?? 100}
                onChange={(e) => onConfigChange("max", e.target.value === "" ? 0 : Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
