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
              onValueChange={(val: any) => setStepDelayMs(val[0])}
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
              onClick={() => setIsLayersViewOpen(!isLayersViewOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 rounded transition cursor-pointer"
              title="Show workspaces as layers"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{layers.findIndex(l => l.id === activeLayerId) + 1} / {layers.length}</span>
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
          <div className="w-full max-w-4xl flex items-center justify-between mb-8">
            <div className="flex flex-col">
              <h2 className="text-xl font-black uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">
                Dimension Deck Navigator
              </h2>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mt-0.5 font-bold">
                Navigate layers with Arrow Keys, Click to select, Enter to confirm
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLayersViewOpen(false)}
              className="h-8 border-zinc-850 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            >
              Close (ESC)
            </Button>
          </div>

          {/* 3D Stack Deck Area */}
          <div className="relative flex-1 w-full max-w-4xl flex items-center justify-center perspective-[1200px]">
            {layers.map((layer, index) => {
              const activeIdx = layers.findIndex(l => l.id === activeLayerId);
              const position = index - activeIdx; // -2, -1, 0, 1, 2...
              const isCurrent = position === 0;
              const isBefore = position < 0;
              
              let transformStyle = "";
              if (isCurrent) {
                transformStyle = "translateZ(0px) rotateX(15deg) rotateY(-10deg) scale(1)";
              } else if (isBefore) {
                transformStyle = `translateX(${position * 110}px) translateY(${position * 10}px) translateZ(${position * 80}px) rotateX(15deg) rotateY(-10deg) scale(${1 + position * 0.08})`;
              } else {
                transformStyle = `translateX(${position * 110}px) translateY(${position * -10}px) translateZ(${position * -80}px) rotateX(15deg) rotateY(-10deg) scale(${1 - position * 0.08})`;
              }

              const opacity = isCurrent ? "opacity-100" : "opacity-45 hover:opacity-75";
              const zIndex = 30 - Math.abs(position);

              return (
                <div
                  key={layer.id}
                  onClick={() => selectLayer(layer.id)}
                  style={{
                    transform: transformStyle,
                    zIndex: zIndex,
                    transformStyle: "preserve-3d",
                    transition: "all 0.5s cubic-bezier(0.25, 1, 0.5, 1)",
                  }}
                  className={`absolute w-80 h-52 rounded-2xl border bg-zinc-900/90 backdrop-blur-md p-5 flex flex-col justify-between shadow-2xl cursor-pointer ${
                    isCurrent
                      ? "border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.25)]"
                      : "border-zinc-800/80 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                  } ${opacity}`}
                >
                  {isCurrent && (
                    <div className="absolute inset-0 bg-cyan-500/5 rounded-2xl pointer-events-none blur-sm" />
                  )}

                  {/* Card Header */}
                  <div className="flex items-start justify-between z-10">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                        Dimension Layer
                      </span>
                      <span className="font-black text-sm text-zinc-100 mt-0.5 uppercase tracking-wide">
                        {layer.name}
                      </span>
                    </div>
                    {layers.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLayer(layer.id);
                        }}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition"
                        title="Collapse dimension"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Card Body - Schematic Preview */}
                  <div className="flex-1 my-3.5 flex items-center justify-center border border-zinc-800/60 bg-zinc-950/50 rounded-lg p-2 overflow-hidden relative select-none">
                    {layer.nodes.length > 0 ? (
                      <div className="w-full h-full flex flex-wrap gap-1 items-center justify-center opacity-70">
                        {layer.nodes.slice(0, 8).map((node) => {
                          let pillColor = "bg-zinc-800/40 border-zinc-700/60 text-zinc-400";
                          if (node.type === "triggerInput") pillColor = "bg-amber-950/40 border-amber-900/60 text-amber-400";
                          else if (node.type === "pythonScript" || node.type?.startsWith("ollama")) pillColor = "bg-violet-950/40 border-violet-900/60 text-violet-400";
                          else if (node.type?.endsWith("Gate") || node.type === "compareNode") pillColor = "bg-emerald-950/40 border-emerald-900/60 text-emerald-400";
                          return (
                            <div key={node.id} className={`text-[6.5px] font-bold px-1.5 py-0.5 rounded-full border ${pillColor}`}>
                              {node.data.label}
                            </div>
                          );
                        })}
                        {layer.nodes.length > 8 && <span className="text-[8px] text-zinc-600 font-bold">+{layer.nodes.length - 8}</span>}
                      </div>
                    ) : (
                      <span className="text-[9px] text-zinc-600 italic">Empty Dimension</span>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest z-10 border-t border-zinc-800/40 pt-2">
                    <span>Nodes: {layer.nodes.length}</span>
                    <span>Connections: {layer.edges.length}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carousel controls */}
          <div className="flex items-center gap-6 mt-8">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-850 px-3 py-1 rounded-full shadow">
              Use ← / → Arrow Keys to rotate deck • Enter to select • ESC to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
