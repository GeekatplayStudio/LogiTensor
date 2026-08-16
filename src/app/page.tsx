"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Group, Panel, Separator } from "react-resizable-panels";
import Sidebar from "@/components/node-editor/sidebar";
import Canvas from "@/components/node-editor/canvas";
import Toolbar from "@/components/node-editor/toolbar";
import NlInputBar from "@/components/node-editor/nl-input-bar";
import CodePanel from "@/components/node-editor/code-panel";
import LayersStackView from "@/components/node-editor/layers-stack-view";
import HelpAboutModal from "@/components/node-editor/help-about-modal";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import { Layers, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// three.js scene is client-only and heavy — load it on demand, never in SSR.
const Flow3DView = dynamic(() => import("@/components/three/flow-3d-view"), { ssr: false });

export default function Home() {
  // Layer controls
  const layers = useNodeEditorStore((state) => state.layers);
  const activeLayerId = useNodeEditorStore((state) => state.activeLayerId);
  const isLayersViewOpen = useNodeEditorStore((state) => state.isLayersViewOpen);
  const addLayer = useNodeEditorStore((state) => state.addLayer);
  const selectLayer = useNodeEditorStore((state) => state.selectLayer);
  const setIsLayersViewOpen = useNodeEditorStore((state) => state.setIsLayersViewOpen);

  const [helpTab, setHelpTab] = useState<"help" | "about" | null>(null);
  const [is3DOpen, setIs3DOpen] = useState(false);

  // Keyboard controls for the 3D deck carousel + closing the 3D preview
  useEffect(() => {
    if (!isLayersViewOpen && !is3DOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (is3DOpen) {
        if (e.key === "Escape") setIs3DOpen(false);
        return;
      }
      const activeIdx = layers.findIndex((l) => l.id === activeLayerId);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        selectLayer(layers[(activeIdx + 1) % layers.length].id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        selectLayer(layers[(activeIdx - 1 + layers.length) % layers.length].id);
      } else if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        setIsLayersViewOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLayersViewOpen, is3DOpen, layers, activeLayerId, selectLayer, setIsLayersViewOpen]);

  return (
    // `relative` anchors the AI activity overlay to the app shell's bottom.
    <div className="relative flex flex-col h-dvh w-full overflow-hidden bg-zinc-950 text-zinc-100 select-none">
      {/* Top Navbar */}
      <header className="h-14 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between px-4 z-20 shrink-0">
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
        <Toolbar onHelp={() => setHelpTab("help")} onAbout={() => setHelpTab("about")} onToggle3D={() => setIs3DOpen(true)} />
      </header>

      {/* Natural-language flow builder — its own slim row above the workspace */}
      <NlInputBar />

      {/* Workspace: resizable/collapsible [palette | canvas | code] panels.
          Drag a separator to resize; drag past a panel's min size to collapse. */}
      <Group orientation="horizontal" className="flex-1 min-h-0">
        <Panel id="palette" defaultSize="16%" minSize="170px" collapsible collapsedSize={0} className="h-full min-w-0">
          <Sidebar />
        </Panel>
        <Separator className="w-1 bg-zinc-900 hover:bg-amber-700/50 transition-colors" title="Drag to resize — drag fully left to collapse the palette" />
        <Panel id="canvas" defaultSize="58%" minSize="30%" className="h-full">
          <div className="relative h-full">
            <Canvas />
            {/* Floating Multilayer Controls */}
            <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 p-1.5 rounded-lg shadow-lg">
              <button
                onClick={() => {
                  const idx = layers.findIndex((l) => l.id === activeLayerId);
                  selectLayer(layers[(idx - 1 + layers.length) % layers.length].id);
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
                <span>{layers.findIndex((l) => l.id === activeLayerId) + 1} / {layers.length}</span>
              </button>
              <button
                onClick={() => {
                  const idx = layers.findIndex((l) => l.id === activeLayerId);
                  selectLayer(layers[(idx + 1) % layers.length].id);
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
        </Panel>
        <Separator className="w-1 bg-zinc-900 hover:bg-emerald-700/50 transition-colors" title="Drag to resize — drag fully right to collapse the code panel" />
        <Panel id="code" defaultSize="26%" minSize="200px" collapsible collapsedSize={0} className="h-full min-w-0">
          <CodePanel />
        </Panel>
      </Group>

      {/* 3D Stack Deck Area Overlay */}
      {isLayersViewOpen && (
        <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-xl z-50 flex flex-col px-6 pt-5 select-none">
          <div className="w-full flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-lg font-semibold text-zinc-100">Dimension Stack</h2>
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
          <LayersStackView />
        </div>
      )}

      {/* three.js flow preview overlay */}
      {is3DOpen && <Flow3DView onClose={() => setIs3DOpen(false)} />}

      <HelpAboutModal tab={helpTab} onTabChange={setHelpTab} onClose={() => setHelpTab(null)} />
    </div>
  );
}
