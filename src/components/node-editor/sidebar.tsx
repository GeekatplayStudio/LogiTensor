import React, { useState } from "react";
import { NODE_DEFINITIONS, NodeDefinition } from "@/types/nodes";
import { Search, Plus } from "lucide-react";
import { useNodeEditorStore } from "./use-node-editor-store";
import { Input } from "@/components/ui/input";

export default function Sidebar() {
  const addNode = useNodeEditorStore((state) => state.addNode);
  const [search, setSearch] = useState("");

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  // Group definitions
  const categories: Record<string, NodeDefinition[]> = {
    Inputs: [],
    Logic: [],
    "Control Flow": [],
    "Math & Compare": [],
    Outputs: [],
    "AI & Scripts": [],
  };

  Object.values(NODE_DEFINITIONS).forEach((def) => {
    if (
      search === "" ||
      def.label.toLowerCase().includes(search.toLowerCase()) ||
      def.description.toLowerCase().includes(search.toLowerCase())
    ) {
      categories[def.category]?.push(def);
    }
  });

  const categoryColors: Record<string, string> = {
    Inputs: "text-blue-400 bg-blue-500/10 border-blue-900/30",
    Logic: "text-teal-400 bg-teal-500/10 border-teal-900/30",
    "Control Flow": "text-purple-400 bg-purple-500/10 border-purple-900/30",
    "Math & Compare": "text-amber-400 bg-amber-500/10 border-amber-900/30",
    Outputs: "text-rose-400 bg-rose-500/10 border-rose-900/30",
    "AI & Scripts": "text-violet-400 bg-violet-500/10 border-violet-900/30",
  };

  return (
    <aside className="w-72 bg-zinc-950 border-r border-zinc-900 flex flex-col h-full z-10 select-none">
      {/* Sidebar Header / Brand */}
      <div className="p-4 border-b border-zinc-900 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center font-bold text-zinc-950 text-xs shadow-[0_0_12px_rgba(245,158,11,0.5)]">
            G
          </div>
          <span className="font-extrabold text-sm uppercase tracking-wider text-zinc-100">
            Geekatplay Node
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-tight">
          Visual programming interface. Drag elements to compose algorithms.
        </p>
      </div>

      {/* Search Box */}
      <div className="px-4 py-3 border-b border-zinc-900 relative">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
        <Input
          type="text"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-xs bg-zinc-900/50 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-700 focus-visible:border-zinc-700"
        />
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
        {Object.entries(categories).map(([catName, nodes]) => {
          if (nodes.length === 0) return null;
          return (
            <div key={catName} className="space-y-2">
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase block mb-1">
                {catName}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {nodes.map((node) => (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, node.type)}
                    onClick={() => addNode(node.type, 100, 100)}
                    className={`group flex items-center justify-between p-2.5 rounded-lg border bg-zinc-900/30 hover:bg-zinc-900/80 border-zinc-900 transition-all duration-200 cursor-grab active:cursor-grabbing hover:border-zinc-800 hover:translate-x-0.5`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="text-xs font-semibold text-zinc-200 group-hover:text-zinc-50 transition">
                        {node.label}
                      </span>
                      <span className="text-[9px] text-zinc-500 truncate leading-snug">
                        {node.description}
                      </span>
                    </div>
                    <button
                      className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-800 transition ${categoryColors[catName]}`}
                      title="Add to center"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Add node to some default middle position
                        addNode(node.type, 300, 200);
                      }}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {Object.values(categories).every((n) => n.length === 0) && (
          <div className="text-center text-xs text-zinc-600 py-10">
            No matching nodes found.
          </div>
        )}
      </div>
    </aside>
  );
}
