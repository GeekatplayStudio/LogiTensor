"use client";

import React, { useRef } from "react";
import {
  Play,
  Pause,
  StepForward,
  FlaskConical,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  Activity,
  HelpCircle,
  Info,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useNodeEditorStore } from "./use-node-editor-store";

// Compact header toolbar: everything except the primary Run action is an
// icon-only button with a hover tooltip (native title), per the minimal-UI
// requirement. Extracted from page.tsx so the page stays a layout shell.

const iconBtn =
  "h-8 w-8 p-0 bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200";

export default function Toolbar({
  onHelp,
  onAbout,
  onToggle3D,
}: {
  onHelp: () => void;
  onAbout: () => void;
  onToggle3D: () => void;
}) {
  const isRunning = useNodeEditorStore((s) => s.isRunning);
  const runAll = useNodeEditorStore((s) => s.runAll);
  const runTests = useNodeEditorStore((s) => s.runTests);
  const isPaused = useNodeEditorStore((s) => s.isPaused);
  const setIsPaused = useNodeEditorStore((s) => s.setIsPaused);
  const stepOnce = useNodeEditorStore((s) => s.stepOnce);
  const resetExecutionStates = useNodeEditorStore((s) => s.resetExecutionStates);
  const clearBoard = useNodeEditorStore((s) => s.clearBoard);
  const saveToFile = useNodeEditorStore((s) => s.saveToFile);
  const loadFromFile = useNodeEditorStore((s) => s.loadFromFile);
  const stepDelayMs = useNodeEditorStore((s) => s.stepDelayMs);
  const setStepDelayMs = useNodeEditorStore((s) => s.setStepDelayMs);
  const runLoops = useNodeEditorStore((s) => s.runLoops);
  const setRunLoops = useNodeEditorStore((s) => s.setRunLoops);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) loadFromFile(content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        onClick={runAll}
        disabled={isRunning}
        className={`h-8 gap-1.5 px-3 bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.3)] duration-200 border-none cursor-pointer ${isRunning ? "animate-pulse" : ""}`}
        title="Run the whole flow on the Python engine"
      >
        {isRunning ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        <span className="text-xs font-black uppercase tracking-wider">{isRunning ? "Running" : "Run"}</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={runTests}
        disabled={isRunning}
        className={iconBtn}
        title="Run Tests: fire every Manual Trigger live on the canvas, then check all Expected Value nodes"
      >
        <FlaskConical className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsPaused(!isPaused)}
        className={`${iconBtn} ${isPaused ? "!text-amber-400 !border-amber-800/60" : ""}`}
        title={isPaused ? "Resume trigger flow" : "Pause trigger flow (step through hops)"}
      >
        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </Button>

      {isPaused && (
        <Button
          variant="outline"
          size="sm"
          onClick={stepOnce}
          className={`${iconBtn} !text-amber-400`}
          title="Advance one trigger hop"
        >
          <StepForward className="w-3.5 h-3.5" />
        </Button>
      )}

      <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 px-2.5 h-8 rounded-md" title="How many times Run repeats the whole flow">
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

      <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 px-2.5 h-8 rounded-md min-w-[150px]" title="Delay between trigger hops (visual pacing)">
        <span className="text-[9px] uppercase font-extrabold text-zinc-500 tracking-wider">Delay</span>
        <Slider
          min={0}
          max={2000}
          step={50}
          value={[stepDelayMs]}
          onValueChange={(val: any) => setStepDelayMs(Array.isArray(val) ? val[0] : val)}
          className="w-14 cursor-pointer"
        />
        <span className="text-[10px] font-mono text-amber-400 font-bold min-w-[38px] text-right">{stepDelayMs}ms</span>
      </div>

      <div className="w-px h-5 bg-zinc-800 mx-0.5" />

      <Button variant="outline" size="sm" onClick={resetExecutionStates} className={iconBtn} title="Reset node statuses and clear edge values">
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>
      <Button variant="outline" size="sm" onClick={clearBoard} className={`${iconBtn} hover:!text-red-400 hover:!border-red-900/30`} title="Clear all nodes and connections">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>

      <div className="w-px h-5 bg-zinc-800 mx-0.5" />

      <Button variant="outline" size="sm" onClick={saveToFile} className={iconBtn} title="Export algorithm to JSON">
        <Download className="w-3.5 h-3.5" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className={iconBtn} title="Import algorithm from JSON">
        <Upload className="w-3.5 h-3.5" />
      </Button>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

      <div className="w-px h-5 bg-zinc-800 mx-0.5" />

      <Button variant="outline" size="sm" onClick={onToggle3D} className={`${iconBtn} hover:!text-cyan-300`} title="Flow 3D preview (three.js)">
        <Box className="w-3.5 h-3.5" />
      </Button>
      <Button variant="outline" size="sm" onClick={onHelp} className={iconBtn} title="How LogiTensor works">
        <HelpCircle className="w-3.5 h-3.5" />
      </Button>
      <Button variant="outline" size="sm" onClick={onAbout} className={iconBtn} title="About LogiTensor">
        <Info className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
