"use client";

import React, { useRef, useEffect } from "react";
import Sidebar from "@/components/node-editor/sidebar";
import Canvas from "@/components/node-editor/canvas";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import {
  Play,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  Layers,
  Activity,
  Plus,
  Copy,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export default function Home() {
  const isRunning = useNodeEditorStore((state) => state.isRunning);
  const runAll = useNodeEditorStore((state) => state.runAll);
  const resetExecutionStates = useNodeEditorStore((state) => state.resetExecutionStates);
  const clearBoard = useNodeEditorStore((state) => state.clearBoard);
  const saveToFile = useNodeEditorStore((state) => state.saveToFile);
  const loadFromFile = useNodeEditorStore((state) => state.loadFromFile);
  const stepDelayMs = useNodeEditorStore((state) => state.stepDelayMs);
  const setStepDelayMs = useNodeEditorStore((state) => state.setStepDelayMs);
  const runLoops = useNodeEditorStore((state) => state.runLoops);
  const setRunLoops = useNodeEditorStore((state) => state.setRunLoops);
  
  // Layer controls
  const layers = useNodeEditorStore((state) => state.layers);
  const activeLayerId = useNodeEditorStore((state) => state.activeLayerId);
  const isLayersViewOpen = useNodeEditorStore((state) => state.isLayersViewOpen);
  const addLayer = useNodeEditorStore((state) => state.addLayer);
  const duplicateLayer = useNodeEditorStore((state) => state.duplicateLayer);
  const selectLayer = useNodeEditorStore((state) => state.selectLayer);
  const deleteLayer = useNodeEditorStore((state) => state.deleteLayer);
  const setIsLayersViewOpen = useNodeEditorStore((state) => state.setIsLayersViewOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        loadFromFile(content);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset file input
  };



  // Keyboard controls for 3D deck carousel
  useEffect(() => {
    if (!isLayersViewOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeIdx = layers.findIndex(l => l.id === activeLayerId);
      
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = (activeIdx + 1) % layers.length;
        selectLayer(layers[nextIdx].id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = (activeIdx - 1 + layers.length) % layers.length;
        selectLayer(layers[prevIdx].id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        setIsLayersViewOpen(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsLayersViewOpen(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLayersViewOpen, layers, activeLayerId, selectLayer, setIsLayersViewOpen]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100 select-none">
      {/* Top Navbar */}
      <header className="h-14 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between px-6 z-20 shrink-0">
        {/* Branding & Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
            <Layers className="w-4 h-4 text-zinc-950" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Geekatplay Studio
            </span>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-0.5">
              LogiBoard Visual Editor
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          <Button
            onClick={runAll}
            disabled={isRunning}
            className={`h-8 gap-1.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.3)] duration-200 border-none cursor-pointer ${
              isRunning ? "animate-pulse" : ""
            }`}
          >
            {isRunning ? (
              <Activity className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span className="text-xs font-black uppercase tracking-wider">
              {isRunning ? "Running..." : "Run Flow"}
            </span>
          </Button>

          <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 px-2.5 h-8 rounded-md">
            <span className="text-[9px] uppercase font-extrabold text-zinc-500 tracking-wider">Loops</span>
            <input
              type="number"
              min={1}
              max={100}
              value={runLoops}
              onChange={(e) => setRunLoops(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              disabled={isRunning}
              className="w-9 h-5 text-[10px] font-mono font-bold text-center bg-zinc-950 border border-zinc-800 text-zinc-100 rounded focus:outline-none focus:border-zinc-700"
            />
          </div>

          <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800/80 px-3 h-8 rounded-md min-w-[170px]">
            <span className="text-[9px] uppercase font-extrabold text-zinc-500 tracking-wider">Delay</span>
            <Slider
              min={0}
              max={2000}
              step={50}
              value={[stepDelayMs]}
              onValueChange={(val: any) => setStepDelayMs(Array.isArray(val) ? val[0] : val)}
              className="w-16 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-amber-400 font-bold min-w-[40px] text-right">
              {stepDelayMs}ms
            </span>
          </div>

          <div className="w-px h-5 bg-zinc-800 mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={resetExecutionStates}
            className="h-8 gap-1.5 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="Reset node statuses to idle"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-xs uppercase font-medium">Reset</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearBoard}
            className="h-8 gap-1.5 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-red-400 hover:border-red-900/30"
            title="Clear all nodes and connections"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-xs uppercase font-medium">Clear</span>
          </Button>

          <div className="w-px h-5 bg-zinc-800 mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={saveToFile}
            className="h-8 gap-1.5 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="Export algorithm to JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="text-xs uppercase font-medium">Save</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadClick}
            className="h-8 gap-1.5 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="Import algorithm from JSON"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="text-xs uppercase font-medium">Load</span>
          </Button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 w-full flex flex-row overflow-hidden">
        {/* Left Side: Drag-and-Drop Nodes Palette */}
        <Sidebar />

        {/* Center: Interactive React Flow Editor Canvas */}
        <div className="relative flex-1 h-full">
          <Canvas />
          
          {/* Floating Multilayer Controls */}
          <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 p-1.5 rounded-lg shadow-lg">
            <button
              onClick={() => {
                const idx = layers.findIndex((l) => l.id === activeLayerId);
                const prevIdx = (idx - 1 + layers.length) % layers.length;
                selectLayer(layers[prevIdx].id);
              }}
              disabled={layers.length <= 1}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-default"
              title="Previous dimension"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsLayersViewOpen(!isLayersViewOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 rounded transition cursor-pointer"
              title="Show workspaces as layers"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{layers.findIndex(l => l.id === activeLayerId) + 1} / {layers.length}</span>
            </button>
            <button
              onClick={() => {
                const idx = layers.findIndex((l) => l.id === activeLayerId);
                const nextIdx = (idx + 1) % layers.length;
                selectLayer(layers[nextIdx].id);
              }}
              disabled={layers.length <= 1}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-default"
              title="Next dimension"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={addLayer}
              className="p-1 rounded bg-cyan-600 hover:bg-cyan-500 text-zinc-950 transition active:scale-95 shadow-[0_0_8px_rgba(8,145,178,0.3)] cursor-pointer"
              title="Create new dimension layer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3D Stack Deck Area Overlay */}
      {isLayersViewOpen && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-8 select-none">
          {/* Close Button / Header */}
          <div className="w-full max-w-5xl flex items-center justify-between mb-10">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-zinc-100">
                Dimension Layers
              </h2>
              <p className="text-xs text-zinc-500">
                Use ← / → to navigate, click a page to select, Enter to confirm
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLayersViewOpen(false)}
              className="h-8 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            >
              Close (ESC)
            </Button>
          </div>

          {/* Dimension Pages Area */}
          <div className="relative flex-1 w-full flex items-center justify-center perspective-[2200px]">
            {layers.map((layer, index) => {
              const activeIdx = layers.findIndex(l => l.id === activeLayerId);
              const position = index - activeIdx; // -2, -1, 0, 1, 2...
              const isCurrent = position === 0;
              const isBefore = position < 0;

              let transformStyle = "";
              if (isCurrent) {
                transformStyle = "translateZ(0px) rotateY(0deg) scale(1)";
              } else if (isBefore) {
                transformStyle = `translateX(${position * 260}px) translateZ(${position * 260}px) rotateY(32deg) scale(${1 + position * 0.1})`;
              } else {
                transformStyle = `translateX(${position * 260}px) translateZ(${position * -260}px) rotateY(32deg) scale(${1 - position * 0.1})`;
              }

              const depthEffect = isCurrent ? "" : "opacity-30 blur-[1px] saturate-[0.4]";
              const zIndex = 30 - Math.abs(position);

              return (
                <div
                  key={layer.id}
                  onClick={() => selectLayer(layer.id)}
                  style={{
                    transform: transformStyle,
                    zIndex: zIndex,
                    transformStyle: "preserve-3d",
                    transition: "all 0.6s cubic-bezier(0.25, 1, 0.5, 1)",
                  }}
                  className={`absolute w-[70vw] h-[68vh] max-w-[1000px] rounded-2xl bg-white/[0.025] backdrop-blur-xl flex flex-col justify-between shadow-[0_30px_100px_rgba(0,0,0,0.5)] cursor-pointer transition-[opacity,filter] duration-500 ${depthEffect}`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between px-10 pt-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-zinc-500 tracking-wide">
                        Dimension Layer
                      </span>
                      <span className="font-semibold text-2xl text-zinc-100">
                        {layer.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateLayer(layer.id);
                        }}
                        className="p-2 rounded-md hover:bg-white/5 text-zinc-500 hover:text-zinc-200 transition"
                        title="Duplicate dimension to a new layer"
                      >
                        <Copy size={16} />
                      </button>
                      {layers.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLayer(layer.id);
                          }}
                          className="p-2 rounded-md hover:bg-white/5 text-zinc-500 hover:text-red-400 transition"
                          title="Collapse dimension"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Body - Schematic Preview */}
                  <div className="flex-1 mx-10 my-6 flex items-center justify-center overflow-hidden relative select-none">
                    {layer.nodes.length > 0 ? (
                      <div className="w-full h-full flex flex-wrap gap-2 items-center justify-center content-center">
                        {layer.nodes.slice(0, 14).map((node) => {
                          let pillColor = "bg-white/[0.03] text-zinc-400";
                          if (node.type === "triggerInput") pillColor = "bg-amber-500/[0.06] text-amber-400/80";
                          else if (node.type === "pythonScript" || node.type?.startsWith("ollama")) pillColor = "bg-violet-500/[0.06] text-violet-400/80";
                          else if (node.type?.endsWith("Gate") || node.type === "compareNode") pillColor = "bg-emerald-500/[0.06] text-emerald-400/80";
                          return (
                            <div key={node.id} className={`text-xs font-medium px-3 py-1.5 rounded-full ${pillColor}`}>
                              {node.data.label}
                            </div>
                          );
                        })}
                        {layer.nodes.length > 14 && <span className="text-xs text-zinc-600">+{layer.nodes.length - 14} more</span>}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-600">Empty dimension</span>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-500 px-10 pb-8">
                    <span>{layer.nodes.length} node{layer.nodes.length === 1 ? "" : "s"}</span>
                    <span>{layer.edges.length} connection{layer.edges.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Page position indicator */}
          <div className="flex items-center gap-2 mt-10">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className={`h-1.5 rounded-full transition-all ${
                  layer.id === activeLayerId ? "w-6 bg-zinc-300" : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
