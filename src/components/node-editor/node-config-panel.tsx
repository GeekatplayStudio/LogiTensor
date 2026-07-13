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

// Per-node-type config editors shown in a node's body. Split out of
// custom-nodes.tsx to keep that file under the repo's module size guardrail.
export default function NodeConfigPanel({
  type,
  data,
  onConfigChange,
}: {
  type: string | undefined;
  data: any;
  onConfigChange: (key: string, val: any) => void;
}) {
  return (
    <div className="p-3 border-b border-zinc-900 bg-zinc-900/10 space-y-2">
      {type === "constNum" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Value</Label>
          <Input
            type="number"
            value={data.config?.value ?? 0}
            onChange={(e) => onConfigChange("value", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
        </div>
      )}

      {type === "constBool" && (
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] text-zinc-400">Value</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">{data.config?.value ? "True" : "False"}</span>
            <Switch
              checked={!!data.config?.value}
              onCheckedChange={(val) => onConfigChange("value", val)}
            />
          </div>
        </div>
      )}

      {type === "constString" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Value</Label>
          <Input
            type="text"
            value={data.config?.value ?? ""}
            onChange={(e) => onConfigChange("value", e.target.value)}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
        </div>
      )}

      {type === "compareNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Comparison</Label>
          <Select
            value={data.config?.op ?? "=="}
            onValueChange={(val) => onConfigChange("op", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select operator" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="==">== (Equal)</SelectItem>
              <SelectItem value="!=">!= (Not Equal)</SelectItem>
              <SelectItem value=">">&gt; (Greater)</SelectItem>
              <SelectItem value=">=">&gt;= (Greater/Equal)</SelectItem>
              <SelectItem value="<">&lt; (Less)</SelectItem>
              <SelectItem value="<=">&lt;= (Less/Equal)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {type === "expressionNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Expression (Safe JS)</Label>
          <Input
            type="text"
            value={data.config?.expression ?? ""}
            onChange={(e) => onConfigChange("expression", e.target.value)}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 font-mono text-zinc-200"
            placeholder="e.g. x * 2 + y"
          />
        </div>
      )}

      {type === "mathNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Formula</Label>
          <Input
            type="text"
            value={data.config?.expression ?? ""}
            onChange={(e) => onConfigChange("expression", e.target.value)}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 font-mono text-zinc-200"
            placeholder="e.g. a + b * c"
          />
          <p className="text-[9px] text-zinc-600 leading-tight">
            Inputs grow automatically (a, b, c…). Numbers compute; strings join with +. Either case works — a+b and A+B are the same.
          </p>
        </div>
      )}

      {type === "mathFunctionNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Function</Label>
          <Select
            value={data.config?.op ?? "abs"}
            onValueChange={(val) => onConfigChange("op", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select function" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="abs">abs(a)</SelectItem>
              <SelectItem value="round">round(a)</SelectItem>
              <SelectItem value="floor">floor(a)</SelectItem>
              <SelectItem value="ceil">ceil(a)</SelectItem>
              <SelectItem value="sqrt">sqrt(a)</SelectItem>
              <SelectItem value="pow">pow(a, b)</SelectItem>
              <SelectItem value="min">min(a, b)</SelectItem>
              <SelectItem value="max">max(a, b)</SelectItem>
              <SelectItem value="mod">mod(a, b)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {type === "filterNode" && (
        <div className="space-y-1.5">
          <Label className="text-[10px] text-zinc-400">Mode</Label>
          <Select
            value={data.config?.mode ?? "include"}
            onValueChange={(val) => onConfigChange("mode", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="include">Include (pass when found)</SelectItem>
              <SelectItem value="exclude">Exclude (pass when NOT found)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[10px] text-zinc-400">Case sensitive</span>
            <Switch
              checked={!!data.config?.caseSensitive}
              onCheckedChange={(val) => onConfigChange("caseSensitive", val)}
            />
          </div>
        </div>
      )}

      {type === "stringOpNode" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Operation</Label>
          <Select
            value={data.config?.op ?? "uppercase"}
            onValueChange={(val) => onConfigChange("op", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select operation" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="uppercase">UPPERCASE</SelectItem>
              <SelectItem value="lowercase">lowercase</SelectItem>
              <SelectItem value="trim">Trim whitespace</SelectItem>
              <SelectItem value="length">Length</SelectItem>
              <SelectItem value="reverse">Reverse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {(type === "forLoopNode" || type === "whileLoopNode") && (
        <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
          <span className="text-[10px] text-zinc-400 font-medium">
            {type === "forLoopNode" ? "Current Index" : "Current Iteration"}
          </span>
          <span className="font-mono text-xs font-bold text-purple-400">
            {data.config?.[type === "forLoopNode" ? "index" : "iteration"] ?? 0}
          </span>
        </div>
      )}

      {type === "counterNode" && (
        <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
          <span className="text-[10px] text-zinc-400 font-medium">Current Count</span>
          <span className="font-mono text-xs font-bold text-purple-400">
            {data.config?.count ?? 0}
          </span>
        </div>
      )}

      {type === "loggerNode" && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <Label className="text-[10px] text-zinc-400">Recent Logs</Label>
            <button
              onClick={() => onConfigChange("logs", [])}
              className="text-[9px] hover:text-red-400 text-zinc-500 transition"
            >
              Clear
            </button>
          </div>
          <div className="max-h-20 overflow-y-auto bg-zinc-950 border border-zinc-900 rounded p-1.5 font-mono text-[9px] text-zinc-400 scrollbar-thin">
            {data.config?.logs && data.config.logs.length > 0 ? (
              data.config.logs.map((log: string, idx: number) => (
                <div key={idx} className="border-b border-zinc-900/40 py-0.5 leading-tight">
                  {log}
                </div>
              ))
            ) : (
              <div className="text-zinc-600 italic">No logs yet. Run trigger.</div>
            )}
          </div>
        </div>
      )}

      {type === "thresholdNeuron" && (
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] text-zinc-400">Fire when</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">{data.config?.mode === "below" ? "Below" : "Above"}</span>
            <Switch
              checked={data.config?.mode === "below"}
              onCheckedChange={(val) => onConfigChange("mode", val ? "below" : "above")}
            />
          </div>
        </div>
      )}

      {type === "maxSelectorNode" && (
        <p className="text-[9px] text-zinc-600 leading-tight">
          Inputs grow automatically (a, b, c…). Outputs whichever connected value is highest.
        </p>
      )}

      {type === "synapseNode" && (
        <div className="space-y-1.5">
          <Label className="text-[10px] text-zinc-400">Weight</Label>
          <Input
            type="number"
            step="0.1"
            value={data.config?.weight ?? 1}
            onChange={(e) => onConfigChange("weight", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[10px] text-zinc-400">Inhibitory</span>
            <Switch
              checked={!!data.config?.inhibitory}
              onCheckedChange={(val) => onConfigChange("inhibitory", val)}
            />
          </div>
        </div>
      )}

      {type === "leakyIntegrateFire" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between py-1 bg-zinc-950/40 px-2 rounded border border-zinc-900/60">
            <span className="text-[10px] text-zinc-400 font-medium">Potential</span>
            <span className="font-mono text-xs font-bold text-purple-400">
              {Number(data.config?.potential ?? 0).toFixed(2)}
            </span>
          </div>
          <Label className="text-[10px] text-zinc-400">Threshold</Label>
          <Input
            type="number"
            step="0.1"
            value={data.config?.threshold ?? 1}
            onChange={(e) => onConfigChange("threshold", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
          <Label className="text-[10px] text-zinc-400">Leak (per step, 0–1)</Label>
          <Input
            type="number"
            step="0.05"
            value={data.config?.leak ?? 0.2}
            onChange={(e) => onConfigChange("leak", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
          <Label className="text-[10px] text-zinc-400">Reset Value</Label>
          <Input
            type="number"
            step="0.1"
            value={data.config?.resetValue ?? 0}
            onChange={(e) => onConfigChange("resetValue", e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
          />
        </div>
      )}

      {type === "denseLayer" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] text-zinc-400">Neurons</Label>
            <Input
              type="number"
              min={1}
              max={64}
              value={data.config?.neurons ?? 8}
              onChange={(e) => onConfigChange("neurons", e.target.value === "" ? 1 : Number(e.target.value))}
              className="h-6 w-16 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
          <Label className="text-[10px] text-zinc-400">Activation</Label>
          <Select
            value={data.config?.activation ?? "sigmoid"}
            onValueChange={(val) => onConfigChange("activation", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select activation" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="sigmoid">Sigmoid (0–1)</SelectItem>
              <SelectItem value="relu">ReLU (max 0, z)</SelectItem>
              <SelectItem value="tanh">Tanh (-1–1)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] text-zinc-400" title="Weights are generated deterministically from this seed — same seed, same web.">
              Weight Seed
            </Label>
            <Input
              type="number"
              value={data.config?.seed ?? 42}
              onChange={(e) => onConfigChange("seed", e.target.value === "" ? 0 : Number(e.target.value))}
              className="h-6 w-16 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
        </div>
      )}

      {type === "conv1dLayer" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] text-zinc-400">Filters</Label>
            <Input
              type="number"
              min={1}
              max={32}
              value={data.config?.filters ?? 4}
              onChange={(e) => onConfigChange("filters", e.target.value === "" ? 1 : Number(e.target.value))}
              className="h-6 w-16 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] text-zinc-400" title="How many consecutive values each filter reads at once.">
              Kernel Size
            </Label>
            <Input
              type="number"
              min={1}
              max={16}
              value={data.config?.kernelSize ?? 3}
              onChange={(e) => onConfigChange("kernelSize", e.target.value === "" ? 1 : Number(e.target.value))}
              className="h-6 w-16 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] text-zinc-400" title="How far the kernel window moves between reads. 1 = every position; 2 = skip every other.">
              Stride
            </Label>
            <Input
              type="number"
              min={1}
              value={data.config?.stride ?? 1}
              onChange={(e) => onConfigChange("stride", e.target.value === "" ? 1 : Number(e.target.value))}
              className="h-6 w-16 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
          <Label className="text-[10px] text-zinc-400">Activation</Label>
          <Select
            value={data.config?.activation ?? "relu"}
            onValueChange={(val) => onConfigChange("activation", val)}
          >
            <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select activation" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="relu">ReLU (max 0, z)</SelectItem>
              <SelectItem value="sigmoid">Sigmoid (0–1)</SelectItem>
              <SelectItem value="tanh">Tanh (-1–1)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] text-zinc-400" title="Kernels are generated deterministically from this seed — same seed, same filters.">
              Weight Seed
            </Label>
            <Input
              type="number"
              value={data.config?.seed ?? 42}
              onChange={(e) => onConfigChange("seed", e.target.value === "" ? 0 : Number(e.target.value))}
              className="h-6 w-16 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
        </div>
      )}

      {type === "pythonScript" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-400">Python Code</Label>
          <Textarea
            value={data.config?.code ?? ""}
            onChange={(e) => onConfigChange("code", e.target.value)}
            className="h-28 text-[11px] font-mono bg-zinc-950 border-zinc-800 text-zinc-200 scrollbar-thin resize-none"
            placeholder="# Write Python code here"
          />
        </div>
      )}

      {type === "ollamaLLM" && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label className="text-[10px] text-zinc-400">Model</Label>
            <Input
              type="text"
              value={data.config?.model ?? "llama3"}
              onChange={(e) => onConfigChange("model", e.target.value)}
              className="h-6 w-24 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">System Prompt</Label>
            <Input
              type="text"
              value={data.config?.systemPrompt ?? ""}
              onChange={(e) => onConfigChange("systemPrompt", e.target.value)}
              className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
              placeholder="System instructions..."
            />
          </div>
        </div>
      )}

      {type === "ollamaVLM" && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label className="text-[10px] text-zinc-400">Vision Model</Label>
            <Input
              type="text"
              value={data.config?.model ?? "llava"}
              onChange={(e) => onConfigChange("model", e.target.value)}
              className="h-6 w-24 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Image Source (URL / Path)</Label>
            <Input
              type="text"
              value={data.config?.image ?? ""}
              onChange={(e) => onConfigChange("image", e.target.value)}
              className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
              placeholder="Path or base64 data..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
