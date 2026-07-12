"use client";

import React, { useRef, useState, useEffect } from "react";
import Sidebar from "@/components/node-editor/sidebar";
import Canvas from "@/components/node-editor/canvas";
import LayersStackView from "@/components/node-editor/layers-stack-view";
import HelpAboutModal from "@/components/node-editor/help-about-modal";
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
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Info,
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
  const setIsLayersViewOpen = useNodeEditorStore((state) => state.setIsLayersViewOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [helpTab, setHelpTab] = useState<"help" | "about" | null>(null);

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
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-zinc-950 text-zinc-100 select-none">
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
              LogiTensor Visual Editor
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

          <div className="w-px h-5 bg-zinc-800 mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setHelpTab("help")}
            className="h-8 gap-1.5 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="How LogiTensor works"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="text-xs uppercase font-medium">Help</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setHelpTab("about")}
            className="h-8 gap-1.5 px-2.5 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="About LogiTensor"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="text-xs uppercase font-medium">About</span>
          </Button>
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
        <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-xl z-50 flex flex-col px-6 pt-5 select-none">
          {/* Close Button / Header */}
          <div className="w-full flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-semibold text-zinc-100">
                Dimension Stack
              </h2>
              <p className="text-xs text-zinc-500">
                X-ray view of every dimension&apos;s logic flow, with live bridge wiring between layers
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

          {/* 3D X-Ray Page Stack */}
          <LayersStackView />
        </div>
      )}

      <HelpAboutModal
        tab={helpTab}
        onTabChange={setHelpTab}
        onClose={() => setHelpTab(null)}
      />
    </div>
  );
}
