import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useNodeEditorStore } from "./use-node-editor-store";
import { Play, Trash2, AlertCircle } from "lucide-react";
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
import { getPortColor, getCategoryStyles, getExecutionStyles } from "@/lib/node-styles";

const CustomNodeComponent = ({ id, type, data: rawData, selected }: NodeProps) => {
  const data = rawData as any;
  const edges = useNodeEditorStore((state) => state.edges);
  const deleteNode = useNodeEditorStore((state) => state.deleteNode);
  const updateNodeConfig = useNodeEditorStore((state) => state.updateNodeConfig);
  const updateNodeInputStaticValue = useNodeEditorStore((state) => state.updateNodeInputStaticValue);
  const triggerNode = useNodeEditorStore((state) => state.triggerNode);
  const disconnectHandle = useNodeEditorStore((state) => state.disconnectHandle);
  const toggleNodeMultiDimensional = useNodeEditorStore((state) => state.toggleNodeMultiDimensional);

  // Style categories
  let category: "Inputs" | "Logic" | "Control Flow" | "Math & Compare" | "Outputs" | "AI & Scripts" = "Logic";
  if (["triggerInput", "constNum", "constBool", "constString"].includes(type || "")) {
    category = "Inputs";
  } else if (["ifElseTrigger", "condValue", "delayNode", "counterNode"].includes(type || "")) {
    category = "Control Flow";
  } else if (["compareNode", "expressionNode"].includes(type || "")) {
    category = "Math & Compare";
  } else if (["loggerNode"].includes(type || "")) {
    category = "Outputs";
  } else if (["pythonScript", "ollamaLLM", "ollamaVLM"].includes(type || "")) {
    category = "AI & Scripts";
  }

  const categoryStyles = getCategoryStyles(category, selected);
  const executionStyles = getExecutionStyles(data.executionState || "idle");

  const isPortConnected = (portId: string, isInput: boolean) => {
    return edges.some((e) =>
      isInput
        ? e.target === id && e.targetHandle === portId
        : e.source === id && e.sourceHandle === portId
    );
  };

  const handleManualTrigger = async () => {
    if (type === "triggerInput") {
      await triggerNode(id, "triggerOut");
    }
  };

  const handleConfigChange = (key: string, val: any) => {
    updateNodeConfig(id, { [key]: val });
  };

  const formatDisplayValue = (val: any): string => {
    if (val === null || val === undefined) return "null";
    if (typeof val === "boolean") return val ? "true" : "false";
    if (typeof val === "object") return "Object";
    return String(val);
  };

  const getPortTooltip = (
    port: { id: string; name: string; type: "trigger" | "data"; dataType?: string },
    isInput: boolean
  ): string => {
    if (port.type === "trigger") {
      return isInput
        ? `Trigger Input (${port.name}): Expects execution signal to run this node.\nRight-click to disconnect.`
        : `Trigger Output (${port.name}): Fires execution signal to run next node.\nRight-click to disconnect.`;
    }
    const typeStr = port.dataType ? ` [Type: ${port.dataType}]` : "";
    return isInput
      ? `Data Input (${port.name})${typeStr}: Expects incoming value for this property.\nRight-click to disconnect.`
      : `Data Output (${port.name})${typeStr}: Produces computed value after execution.\nRight-click to disconnect.`;
  };

  // 1. Trigger Input terminator pill shape
  if (type === "triggerInput") {
    const connected = isPortConnected("triggerOut", false);
    return (
      <div
        className={`rounded-full border px-4 py-2 bg-zinc-950/90 backdrop-blur-md text-zinc-100 flex items-center justify-between gap-3 shadow-xl transition-all duration-200 hover:shadow-amber-950/20 ${categoryStyles.border} ${executionStyles}`}
        style={{ minWidth: 160 }}
      >
        <button
          onClick={handleManualTrigger}
          className="w-6 h-6 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 flex items-center justify-center transition active:scale-95 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
          title="Trigger execution flow"
        >
          <Play size={10} fill="currentColor" className="ml-0.5" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">
          {data.label}
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id="triggerOut"
          style={{
            width: "11px",
            height: "11px",
            right: "-6px",
            background: connected ? "#f59e0b" : "#09090b",
            border: "2px solid #f59e0b",
            borderRadius: "50%",
            transition: "all 0.1s ease",
          }}
          className="hover:scale-125 hover:shadow-[0_0_8px_rgba(245,158,11,0.6)] cursor-pointer"
          title="Trigger Output (Out): Fires execution signal to run next node.&#10;Right-click to disconnect."
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            disconnectHandle(id, "triggerOut", "source");
          }}
        />
      </div>
    );
  }

  // 2. Standard nodes with distinct algorithm card shapes
  let shapeClasses = "rounded-xl";
  if (type === "ifElseTrigger") {
    shapeClasses = "rounded-tl-2xl rounded-br-2xl rounded-tr-none rounded-bl-none"; // diamond-cut decision
  } else if (type === "loggerNode") {
    shapeClasses = "rounded-tr-2xl rounded-bl-2xl rounded-tl-none rounded-br-none"; // slanted outputs
  }

  const isMultiDim = !!data.config?.isMultiDimensional;
  const multiDimBorder = isMultiDim 
    ? "border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.25)] bg-gradient-to-b from-cyan-950/20 to-zinc-950/95" 
    : `${categoryStyles.border} ${categoryStyles.accent}`;

  return (
    <div
      className={`min-w-[220px] max-w-[320px] ${shapeClasses} border text-zinc-200 transition-all duration-300 hover:shadow-zinc-900/50 ${multiDimBorder} ${executionStyles}`}
    >
      {/* Node Header */}
      <div
        className={`flex items-center justify-between border-b px-3.5 py-2.5 rounded-t-xl ${categoryStyles.headerBg}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${categoryStyles.accent}`} />
          <span className="font-semibold text-xs tracking-wide uppercase">
            {data.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {type !== "triggerInput" && (
            <button
              onClick={() => toggleNodeMultiDimensional(id)}
              className={`p-1 rounded hover:bg-zinc-800/80 transition active:scale-90 ${
                isMultiDim
                  ? "text-cyan-400 bg-cyan-950/30 hover:text-cyan-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={
                isMultiDim
                  ? "Dimensional Bridge Active (Outputs accessible across workspaces)"
                  : "Enable Dimensional Bridge (Share outputs with other layers)"
              }
            >
              <svg
                className={`w-3.5 h-3.5 ${isMultiDim ? "animate-pulse" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </button>
          )}
          {type === "triggerInput" && (
            <button
              onClick={handleManualTrigger}
              className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 transition active:scale-95 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
              title="Trigger flow"
            >
              <Play size={10} fill="currentColor" />
            </button>
          )}
          <button
            onClick={() => deleteNode(id)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition active:scale-95"
            title="Delete node"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Node Configuration / Custom Editors */}
      <div className="p-3 border-b border-zinc-900 bg-zinc-900/10 space-y-2">
        {type === "constNum" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Value</Label>
            <Input
              type="number"
              value={data.config?.value ?? 0}
              onChange={(e) => handleConfigChange("value", e.target.value === "" ? 0 : Number(e.target.value))}
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
                onCheckedChange={(val) => handleConfigChange("value", val)}
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
              onChange={(e) => handleConfigChange("value", e.target.value)}
              className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
            />
          </div>
        )}

        {type === "compareNode" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Comparison</Label>
            <Select
              value={data.config?.op ?? "=="}
              onValueChange={(val) => handleConfigChange("op", val)}
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
              onChange={(e) => handleConfigChange("expression", e.target.value)}
              className="h-7 text-xs bg-zinc-950 border-zinc-800 font-mono text-zinc-200"
              placeholder="e.g. x * 2 + y"
            />
          </div>
        )}

        {type === "delayNode" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Delay (ms)</Label>
            <Input
              type="number"
              value={data.config?.delayMs ?? 1000}
              onChange={(e) => handleConfigChange("delayMs", Number(e.target.value))}
              className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
              min={0}
              step={100}
            />
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
                onClick={() => handleConfigChange("logs", [])}
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

        {type === "pythonScript" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Python Code</Label>
            <Textarea
              value={data.config?.code ?? ""}
              onChange={(e) => handleConfigChange("code", e.target.value)}
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
                onChange={(e) => handleConfigChange("model", e.target.value)}
                className="h-6 w-24 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">System Prompt</Label>
              <Input
                type="text"
                value={data.config?.systemPrompt ?? ""}
                onChange={(e) => handleConfigChange("systemPrompt", e.target.value)}
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
                onChange={(e) => handleConfigChange("model", e.target.value)}
                className="h-6 w-24 text-[10px] bg-zinc-950 border-zinc-800 text-zinc-200 py-0.5 px-1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Image Source (URL / Path)</Label>
              <Input
                type="text"
                value={data.config?.image ?? ""}
                onChange={(e) => handleConfigChange("image", e.target.value)}
                className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
                placeholder="Path or base64 data..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Inputs and Outputs Ports */}
      <div className="grid grid-cols-2 gap-4 px-3.5 py-2.5 text-xs bg-zinc-950/20">
        {/* Left Side: Inputs */}
        <div className="flex flex-col gap-3 justify-center">
          {data.inputs.map((input: any) => {
            const connected = isPortConnected(input.id, true);
            const portColor = getPortColor(input.type, input.dataType);
            const isLargeInput = ["prompt", "image"].includes(input.id);
            return (
              <div key={input.id} className="relative flex flex-col gap-1 pl-2 group/port">
                <div className="flex items-center h-5">
                  {/* Visual Circle Handle Component */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    style={{
                      width: "11px",
                      height: "11px",
                      left: "-6px",
                      background: connected ? portColor : "#09090b",
                      border: `2px solid ${portColor}`,
                      borderRadius: "50%",
                      transition: "all 0.1s ease",
                    }}
                    className="hover:scale-125 cursor-pointer"
                    title={getPortTooltip(input, true)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      disconnectHandle(id, input.id, "target");
                    }}
                  />
                  
                  <span className="text-[11px] font-semibold text-zinc-300">
                    {input.name}
                  </span>
                </div>

                {/* Inline Input editor if data port is NOT connected and not large */}
                {input.type === "data" && !connected && !isLargeInput && (
                  <div className="pr-3 w-full z-10">
                    {input.dataType === "boolean" ? (
                      <div className="flex items-center gap-1.5 h-5">
                        <Switch
                          checked={!!input.value}
                          onCheckedChange={(val) => updateNodeInputStaticValue(id, input.id, val)}
                        />
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">{input.value ? "True" : "False"}</span>
                      </div>
                    ) : (
                      <Input
                        type={input.dataType === "number" ? "number" : "text"}
                        value={input.value ?? ""}
                        onChange={(e) =>
                          updateNodeInputStaticValue(
                            id,
                            input.id,
                            input.dataType === "number"
                              ? e.target.value === "" ? 0 : Number(e.target.value)
                              : e.target.value
                          )
                        }
                        className="h-6 w-full text-[10px] px-1.5 py-0.5 bg-zinc-950/80 border-zinc-800 text-zinc-200 rounded focus-visible:ring-1 focus-visible:ring-zinc-700"
                        placeholder={`Set ${input.name}`}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Side: Outputs */}
        <div className="flex flex-col gap-3 items-end justify-center">
          {data.outputs.map((output: any) => {
            const connected = isPortConnected(output.id, false);
            const portColor = getPortColor(output.type, output.dataType);
            return (
              <div key={output.id} className="relative flex items-center h-6 pr-2 justify-end gap-1.5 group/port">
                {/* Current Value Preview */}
                {output.type === "data" && output.value !== undefined && (
                  <span
                    className="max-w-[70px] truncate text-[9px] font-mono font-bold bg-zinc-900 text-emerald-400 border border-zinc-800/80 px-1 py-0.2 rounded"
                    title={formatDisplayValue(output.value)}
                  >
                    {formatDisplayValue(output.value)}
                  </span>
                )}
                
                <span className="text-[11px] font-semibold text-zinc-400 group-hover/port:text-zinc-200 transition">
                  {output.name}
                </span>

                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{
                    width: "11px",
                    height: "11px",
                    right: "-6px",
                    background: connected ? portColor : "#09090b",
                    border: `2px solid ${portColor}`,
                    borderRadius: "50%",
                    transition: "all 0.1s ease",
                  }}
                  className="hover:scale-125 cursor-pointer"
                  title={getPortTooltip(output, false)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    disconnectHandle(id, output.id, "source");
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Large Input textareas for AI nodes (Ollama prompt/images) when DISCONNECTED */}
      {["ollamaLLM", "ollamaVLM"].includes(type) && (
        <div className="px-3.5 pb-2.5 space-y-2">
          {/* Prompt Textarea */}
          {!isPortConnected("prompt", true) && (
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Prompt (Disconnected)</Label>
              <Textarea
                value={data.inputs.find((i: any) => i.id === "prompt")?.value ?? ""}
                onChange={(e) => updateNodeInputStaticValue(id, "prompt", e.target.value)}
                className="h-20 text-[11px] bg-zinc-950 border-zinc-800 text-zinc-200 resize-none font-medium scrollbar-thin"
                placeholder="Enter prompt instruction..."
              />
            </div>
          )}

          {/* VLM Image Input */}
          {type === "ollamaVLM" && !isPortConnected("image", true) && (
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Image Source (Disconnected)</Label>
              <Input
                type="text"
                value={data.inputs.find((i: any) => i.id === "image")?.value ?? ""}
                onChange={(e) => updateNodeInputStaticValue(id, "image", e.target.value)}
                className="h-7 text-xs bg-zinc-950 border-zinc-800 text-zinc-200"
                placeholder="Image path or base64..."
              />
            </div>
          )}

          {/* Response Output Display Container */}
          {data.outputs.find((o: any) => o.id === "response")?.value && (
            <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg max-h-36 overflow-y-auto scrollbar-thin shadow-inner animate-fade-in">
              <span className="text-[9px] font-bold text-violet-400 uppercase tracking-widest block mb-1">Ollama Output</span>
              <p className="text-[10px] text-zinc-300 font-medium whitespace-pre-wrap leading-relaxed select-text">
                {data.outputs.find((o: any) => o.id === "response")?.value}
              </p>
            </div>
          )}
        </div>
      )}

      {type === "textOutputNode" && (
        <div className="px-3.5 pb-2.5 space-y-1">
          <Label className="text-[10px] text-zinc-400">Display Output</Label>
          <div 
            className="h-28 overflow-auto bg-zinc-950 border border-zinc-900 rounded-lg p-2 font-mono text-[10.5px] text-zinc-200 scrollbar-thin resize-y select-text leading-relaxed"
            style={{ minHeight: "60px" }}
          >
            {(() => {
              const valInput = data.inputs.find((i: any) => i.id === "value");
              const value = valInput?.value;
              if (value === null || value === undefined || value === "") return <span className="text-zinc-600 italic">No input value</span>;
              return formatDisplayValue(value);
            })()}
          </div>
        </div>
      )}

      {/* Error Message display if any */}
      {data.executionState === "error" && data.errorMessage && (
        <div className="flex items-start gap-1.5 border-t border-red-500/20 px-3 py-1.5 bg-red-950/20 text-[10px] text-red-400 rounded-b-xl leading-tight">
          <AlertCircle size={10} className="shrink-0 mt-0.5" />
          <span className="break-all">{data.errorMessage}</span>
        </div>
      )}

      {/* Execution Timestamp display */}
      {data.lastExecuted && (
        <div className="border-t border-zinc-900 px-3 py-1 text-[8px] text-zinc-600 rounded-b-xl flex items-center justify-between font-mono bg-zinc-950/40">
          <span>RUN COMPLETED</span>
          <span>{new Date(data.lastExecuted).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
};

export const CustomNode = memo(CustomNodeComponent);

export const nodeTypes = {
  triggerInput: CustomNode,
  constNum: CustomNode,
  constBool: CustomNode,
  constString: CustomNode,
  andGate: CustomNode,
  orGate: CustomNode,
  notGate: CustomNode,
  xorGate: CustomNode,
  norGate: CustomNode,
  nandGate: CustomNode,
  ifElseTrigger: CustomNode,
  condValue: CustomNode,
  delayNode: CustomNode,
  counterNode: CustomNode,
  compareNode: CustomNode,
  expressionNode: CustomNode,
  loggerNode: CustomNode,
  pythonScript: CustomNode,
  ollamaLLM: CustomNode,
  ollamaVLM: CustomNode,
  randomNode: CustomNode,
  textOutputNode: CustomNode,
};
