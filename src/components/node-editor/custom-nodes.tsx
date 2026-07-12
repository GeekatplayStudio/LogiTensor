import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useNodeEditorStore } from "./use-node-editor-store";
import { Play, Trash2, AlertCircle, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPortColor, getCategoryStyles, getExecutionStyles } from "@/lib/node-styles";
import NodeConfigPanel from "./node-config-panel";
import { ImageGridBody, DenseLayerBody, OutputLayerBody } from "./ai-model-node-parts";

const CustomNodeComponent = ({ id, type, data: rawData, selected }: NodeProps) => {
  const data = rawData as any;
  const edges = useNodeEditorStore((state) => state.edges);
  const deleteNode = useNodeEditorStore((state) => state.deleteNode);
  const updateNodeConfig = useNodeEditorStore((state) => state.updateNodeConfig);
  const updateNodeInputStaticValue = useNodeEditorStore((state) => state.updateNodeInputStaticValue);
  const triggerNode = useNodeEditorStore((state) => state.triggerNode);
  const disconnectHandle = useNodeEditorStore((state) => state.disconnectHandle);
  const toggleNodeMultiDimensional = useNodeEditorStore((state) => state.toggleNodeMultiDimensional);
  const toggleNodeFederated = useNodeEditorStore((state) => state.toggleNodeFederated);

  // Style categories
  let category: "Inputs" | "Logic" | "Control Flow" | "Math & Compare" | "Data & Text" | "Outputs" | "AI & Scripts" | "Neural Network" | "AI Model" = "Logic";
  if (["triggerInput", "constNum", "constBool", "constString"].includes(type || "")) {
    category = "Inputs";
  } else if (["ifElseTrigger", "condValue", "delayNode", "counterNode", "forLoopNode", "whileLoopNode"].includes(type || "")) {
    category = "Control Flow";
  } else if (["compareNode", "expressionNode", "mathNode", "mathFunctionNode", "randomNode"].includes(type || "")) {
    category = "Math & Compare";
  } else if (["filterNode", "stringOpNode", "replaceTextNode"].includes(type || "")) {
    category = "Data & Text";
  } else if (["loggerNode", "textOutputNode"].includes(type || "")) {
    category = "Outputs";
  } else if (["pythonScript", "ollamaLLM", "ollamaVLM"].includes(type || "")) {
    category = "AI & Scripts";
  } else if (["thresholdNeuron", "maxSelectorNode", "synapseNode", "leakyIntegrateFire"].includes(type || "")) {
    category = "Neural Network";
  } else if (["imageInputGrid", "denseLayer", "outputLayerNode"].includes(type || "")) {
    category = "AI Model";
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
    if (Array.isArray(val)) return `[${val.length} values]`;
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
          className="w-6 h-6 rounded-full bg-[#B99B72] hover:bg-[#C7AC85] text-zinc-950 flex items-center justify-center transition active:scale-95 shadow-[0_0_6px_rgba(185,155,114,0.35)]"
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
            background: connected ? "#B99B72" : "#09090b",
            border: "2px solid #B99B72",
            borderRadius: "50%",
            transition: "all 0.1s ease",
          }}
          className="hover:scale-125 hover:shadow-[0_0_6px_rgba(185,155,114,0.5)] cursor-pointer"
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
  const isFederated = !!data.config?.isFederated;
  const bodyBorder = isMultiDim
    ? "border-[#7FAAB0] shadow-[0_0_12px_rgba(127,170,176,0.2)]"
    : categoryStyles.border;
  const federatedGlow = isFederated ? "shadow-[0_0_12px_rgba(173,139,176,0.22)]" : "";

  return (
    <div
      className={`min-w-[220px] max-w-[320px] ${shapeClasses} border bg-zinc-900 text-zinc-200 transition-all duration-300 hover:shadow-zinc-900/50 ${bodyBorder} ${federatedGlow} ${executionStyles}`}
    >
      {/* Node Header */}
      <div
        className={`flex items-center justify-between border-b px-3.5 py-2.5 rounded-t-xl ${categoryStyles.headerBg}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${categoryStyles.accent}`} />
          <span className="font-semibold text-xs tracking-wide uppercase text-zinc-50">
            {data.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {type !== "triggerInput" && (
            <button
              onClick={() => toggleNodeMultiDimensional(id)}
              className={`p-1 rounded hover:bg-zinc-800/80 transition active:scale-90 ${
                isMultiDim
                  ? "text-[#7FAAB0] bg-[#7FAAB0]/10 hover:text-[#9AC0C4]"
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
          {type !== "triggerInput" && (
            <button
              onClick={() => toggleNodeFederated(id)}
              className={`p-1 rounded hover:bg-zinc-800/80 transition active:scale-90 ${
                isFederated
                  ? "text-[#AD8BB0] bg-[#AD8BB0]/10 hover:text-[#C4A8C6]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={
                isFederated
                  ? "Federation Link Active (Connects this node across hubs)"
                  : "Enable Federation Link (Connect this node to other hubs)"
              }
            >
              <Network className={`w-3.5 h-3.5 ${isFederated ? "animate-pulse" : ""}`} />
            </button>
          )}
          {type === "triggerInput" && (
            <button
              onClick={handleManualTrigger}
              className="p-1 rounded bg-[#B99B72] hover:bg-[#C7AC85] text-zinc-950 transition active:scale-95 shadow-[0_0_6px_rgba(185,155,114,0.35)]"
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
      <NodeConfigPanel type={type} data={data} onConfigChange={handleConfigChange} />

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
                    ) : input.id === "condition" && input.dataType === "any" ? (
                      <Input
                        type="text"
                        value={input.value ?? ""}
                        onChange={(e) => updateNodeInputStaticValue(id, input.id, e.target.value)}
                        className="h-6 w-full text-[10px] px-1.5 py-0.5 bg-zinc-950/80 border-zinc-800 text-zinc-200 rounded focus-visible:ring-1 focus-visible:ring-zinc-700"
                        placeholder="true, false, or a > b"
                        title="Type true/false, a comparison like a > b or x == 5, or connect a boolean output from another node."
                      />
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
                    className="max-w-[70px] truncate text-[9px] font-mono font-bold bg-zinc-900 text-[#8FBFA5] border border-zinc-800/80 px-1 py-0.2 rounded"
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
              <span className="text-[9px] font-bold text-[#AC9BC4] uppercase tracking-widest block mb-1">Ollama Output</span>
              <p className="text-[10px] text-zinc-300 font-medium whitespace-pre-wrap leading-relaxed select-text">
                {data.outputs.find((o: any) => o.id === "response")?.value}
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Model visual bodies: image grid, weight web, activation bars */}
      {type === "imageInputGrid" && (
        <ImageGridBody data={data} onConfigChange={handleConfigChange} />
      )}
      {type === "denseLayer" && <DenseLayerBody id={id} data={data} />}
      {type === "outputLayerNode" && <OutputLayerBody id={id} data={data} />}

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
        <div className="flex items-start gap-1.5 border-t border-[#B57676]/20 px-3 py-1.5 bg-[#B57676]/10 text-[10px] text-[#C99A9A] rounded-b-xl leading-tight">
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
  mathNode: CustomNode,
  mathFunctionNode: CustomNode,
  filterNode: CustomNode,
  stringOpNode: CustomNode,
  replaceTextNode: CustomNode,
  forLoopNode: CustomNode,
  whileLoopNode: CustomNode,
  thresholdNeuron: CustomNode,
  maxSelectorNode: CustomNode,
  synapseNode: CustomNode,
  leakyIntegrateFire: CustomNode,
  imageInputGrid: CustomNode,
  denseLayer: CustomNode,
  outputLayerNode: CustomNode,
};
