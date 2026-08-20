"use client";

import React, { useState } from "react";
import { FlaskConical, Copy, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { useNodeEditorStore } from "./use-node-editor-store";
import { generateTestFile } from "@/lib/codegen/testgen";
import CodeViewer from "./code-viewer";

// Generated-test pane, split below the code editor. Shows the vitest/pytest
// file generateTestFile captured from the live board; Regenerate re-captures
// against the current graph, so it can be refreshed after edits.
export default function TestPanel() {
  const testPanel = useNodeEditorStore((s) => s.testPanel);
  const setTestPanel = useNodeEditorStore((s) => s.setTestPanel);
  const [copied, setCopied] = useState(false);

  if (!testPanel) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(testPanel.code);
    setCopied(true);
    toast.success("Test file copied");
    setTimeout(() => setCopied(false), 1200);
  };

  const regenerate = () => {
    const { nodes, edges } = useNodeEditorStore.getState();
    const result = generateTestFile(nodes, edges, testPanel.target);
    setTestPanel({ code: result.code, lines: result.lines, grammar: result.grammar, target: result.target });
    toast.success("Tests regenerated from the current board");
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-l border-t border-zinc-900">
      <div className="h-8 shrink-0 flex items-center gap-2 px-2.5 border-b border-zinc-900">
        <FlaskConical className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
          Generated tests · {testPanel.target === "python" ? "pytest" : "vitest"}
        </span>
        <button
          onClick={regenerate}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
          title="Regenerate tests from the current board"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={copy}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
          title="Copy test file to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => setTestPanel(null)}
          className="p-1.5 rounded text-zinc-500 hover:text-red-300 hover:bg-zinc-800 transition cursor-pointer"
          title="Close the test pane"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <CodeViewer
        lines={testPanel.lines}
        grammar={testPanel.grammar}
        breakpoints={{}}
        onToggleBreakpoint={() => {}}
        nodeValues={{}}
      />
    </div>
  );
}
