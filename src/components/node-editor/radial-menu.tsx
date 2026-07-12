import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NODE_DEFINITIONS } from "@/types/nodes";
import { useNodeEditorStore } from "./use-node-editor-store";
import { useReactFlow } from "@xyflow/react";
import { HelpCircle, Layers, Cpu, CornerDownRight, X, BarChart, Settings, Brain, Filter, Zap, LayoutGrid } from "lucide-react";

interface RadialMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  isOpen: boolean;
}

export default function RadialMenu({ x, y, onClose, isOpen }: RadialMenuProps) {
  const addNode = useNodeEditorStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Group definitions
  const categories = ["Inputs", "Logic", "Control Flow", "Math & Compare", "Data & Text", "Outputs", "AI & Scripts", "Neural Network", "AI Model"];

  const categoryIcons: Record<string, React.ReactNode> = {
    Inputs: <Layers size={14} />,
    Logic: <Cpu size={14} />,
    "Control Flow": <CornerDownRight size={14} />,
    "Math & Compare": <BarChart size={14} />,
    "Data & Text": <Filter size={14} />,
    Outputs: <Settings size={14} />,
    "AI & Scripts": <Brain size={14} />,
    "Neural Network": <Zap size={14} />,
    "AI Model": <LayoutGrid size={14} />,
  };

  const categoryColors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    Inputs: {
      bg: "bg-[#7C93B5]/15 hover:bg-[#7C93B5]/25",
      text: "text-[#A9BAD3]",
      border: "border-[#7C93B5]/40",
      glow: "shadow-[0_0_8px_rgba(124,147,181,0.3)]",
    },
    Logic: {
      bg: "bg-[#6FA69C]/15 hover:bg-[#6FA69C]/25",
      text: "text-[#A0C7BF]",
      border: "border-[#6FA69C]/40",
      glow: "shadow-[0_0_8px_rgba(111,166,156,0.3)]",
    },
    "Control Flow": {
      bg: "bg-[#9285AD]/15 hover:bg-[#9285AD]/25",
      text: "text-[#BCB2CE]",
      border: "border-[#9285AD]/40",
      glow: "shadow-[0_0_8px_rgba(146,133,173,0.3)]",
    },
    "Math & Compare": {
      bg: "bg-[#B99B72]/15 hover:bg-[#B99B72]/25",
      text: "text-[#D3BE9C]",
      border: "border-[#B99B72]/40",
      glow: "shadow-[0_0_8px_rgba(185,155,114,0.3)]",
    },
    "Data & Text": {
      bg: "bg-[#6FA98A]/15 hover:bg-[#6FA98A]/25",
      text: "text-[#A2C9B3]",
      border: "border-[#6FA98A]/40",
      glow: "shadow-[0_0_8px_rgba(111,169,138,0.3)]",
    },
    Outputs: {
      bg: "bg-[#AD8288]/15 hover:bg-[#AD8288]/25",
      text: "text-[#CBAEB2]",
      border: "border-[#AD8288]/40",
      glow: "shadow-[0_0_8px_rgba(173,130,136,0.3)]",
    },
    "AI & Scripts": {
      bg: "bg-[#9483AD]/15 hover:bg-[#9483AD]/25",
      text: "text-[#BDB0CE]",
      border: "border-[#9483AD]/40",
      glow: "shadow-[0_0_8px_rgba(148,131,173,0.3)]",
    },
    "Neural Network": {
      bg: "bg-[#8686AD]/15 hover:bg-[#8686AD]/25",
      text: "text-[#B7B7CE]",
      border: "border-[#8686AD]/40",
      glow: "shadow-[0_0_8px_rgba(134,134,173,0.3)]",
    },
    "AI Model": {
      bg: "bg-[#7FAAB0]/15 hover:bg-[#7FAAB0]/25",
      text: "text-[#AECBCF]",
      border: "border-[#7FAAB0]/40",
      glow: "shadow-[0_0_8px_rgba(127,170,176,0.3)]",
    },
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  // Filter nodes by selected category
  const filteredNodes = selectedCategory
    ? Object.values(NODE_DEFINITIONS).filter((d) => d.category === selectedCategory)
    : [];

  const handleNodeClick = (type: string) => {
    // Convert click coordinates to Flow space
    const flowPosition = screenToFlowPosition({ x, y });
    addNode(type, flowPosition.x - 100, flowPosition.y - 50); // offset slightly to center
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] pointer-events-auto"
        onClick={onClose}
      />

      {/* Radial Menu Container */}
      <div
        ref={menuRef}
        style={{ left: x, top: y }}
        className="absolute w-0 h-0 flex items-center justify-center pointer-events-auto select-none"
      >
        <AnimatePresence>
          {/* Main Hub (Center Button) */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            transition={{ type: "spring", damping: 15 }}
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-zinc-300 hover:text-amber-400 flex items-center justify-center cursor-pointer shadow-[0_0_20px_rgba(0,0,0,0.8)] z-30 transition-colors"
          >
            <div className="flex flex-col items-center justify-center">
              <span className="text-[7px] font-extrabold uppercase text-amber-500">Geek</span>
              <X size={12} className="mt-[-2px]" />
            </div>
          </motion.div>

          {/* First Ring: Categories */}
          {categories.map((cat, idx) => {
            const angle = (idx / categories.length) * 2 * Math.PI - Math.PI / 2; // offset by 90deg to start top
            const radius = 68;
            const itemX = Math.cos(angle) * radius;
            const itemY = Math.sin(angle) * radius;
            const colors = categoryColors[cat] || {
              bg: "bg-zinc-950",
              text: "text-zinc-400",
              border: "border-zinc-800",
              glow: "",
            };

            const isSelected = selectedCategory === cat;

            return (
              <motion.div
                key={cat}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: itemX, y: itemY, opacity: 1 }}
                exit={{ x: 0, y: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 18, delay: idx * 0.03 }}
                onClick={() => setSelectedCategory(isSelected ? null : cat)}
                className={`absolute w-11 h-11 rounded-full border ${colors.bg} ${colors.text} ${colors.border} flex items-center justify-center cursor-pointer text-xs font-semibold z-20 ${colors.glow} hover:scale-110 active:scale-95 transition-transform ${
                  isSelected ? "ring-2 ring-zinc-300 scale-105" : ""
                }`}
                title={cat}
              >
                {categoryIcons[cat] || <HelpCircle size={14} />}
              </motion.div>
            );
          })}

          {/* Second Ring: Nodes in Category */}
          {selectedCategory && (
            <>
              {filteredNodes.map((node, idx) => {
                // Radial layout of sub-items around the outer ring
                const total = filteredNodes.length;
                // Position them in a clean arc or full circle
                const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
                const radius = 135;
                const subX = Math.cos(angle) * radius;
                const subY = Math.sin(angle) * radius;
                const colors = categoryColors[selectedCategory] || {
                  bg: "bg-zinc-950",
                  text: "text-zinc-400",
                  border: "border-zinc-800",
                  glow: "",
                };

                return (
                  <motion.div
                    key={node.type}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                    animate={{ x: subX, y: subY, opacity: 1, scale: 1 }}
                    exit={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", damping: 16, delay: idx * 0.02 }}
                    onClick={() => handleNodeClick(node.type)}
                    className={`absolute px-2.5 py-1.5 rounded-lg border bg-zinc-950/95 border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-zinc-50 font-medium text-[10px] whitespace-nowrap cursor-pointer z-10 shadow-lg hover:scale-105 active:scale-95 transition-all max-w-[120px] truncate`}
                    title={node.description}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1 h-1 rounded-full ${colors.text.replace("text-", "bg-")}`} />
                      <span>{node.label}</span>
                    </div>
                  </motion.div>
                );
              })}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
