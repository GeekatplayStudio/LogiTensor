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

// Config editors for the Device Lab connectivity nodes. Own file per the
// repo's 500-line guardrail, mounted from node-config-panel.tsx.
export default function DeviceNodeConfig({
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
      {type === "wifiScan" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Band</Label>
          <Select
            value={data.config?.band ?? "all"}
            onValueChange={(val) => onConfigChange("band", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All bands</SelectItem>
              <SelectItem value="2.4">2.4 GHz</SelectItem>
              <SelectItem value="5">5 GHz</SelectItem>
              <SelectItem value="6">6 GHz (WiFi 6E)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {type === "wifiConnect" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Security</Label>
          <Select
            value={data.config?.security ?? "wpa2"}
            onValueChange={(val) => onConfigChange("security", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wpa2">WPA2-PSK</SelectItem>
              <SelectItem value="wpa3">WPA3-SAE</SelectItem>
            </SelectContent>
          </Select>
          {data.config?.connected ? (
            <div className="text-[10px] font-mono text-emerald-400">
              connected · {data.config?.ip} · {data.config?.rssi} dBm
            </div>
          ) : (
            <div className="text-[10px] text-zinc-500">not connected</div>
          )}
        </div>
      )}

      {type === "bleScan" && (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-zinc-400">Scan duration (ms)</Label>
          <Input
            type="number"
            value={data.config?.durationMs ?? 3000}
            onChange={(e) => onConfigChange("durationMs", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
        </div>
      )}

      {type === "usbSerialSend" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-zinc-400">Port</Label>
              <Input
                value={data.config?.port ?? ""}
                onChange={(e) => onConfigChange("port", e.target.value)}
                placeholder="COM5"
                className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-zinc-400">Baud</Label>
              <Input
                type="number"
                value={data.config?.baud ?? 115200}
                onChange={(e) => onConfigChange("baud", e.target.value === "" ? 0 : Number(e.target.value))}
                className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
              />
            </div>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[10px] text-zinc-400">Append newline</span>
            <Switch
              checked={data.config?.newline ?? true}
              onCheckedChange={(val) => onConfigChange("newline", val)}
            />
          </div>
        </div>
      )}
    </>
  );
}
