"use client";

import React from "react";
import {
  X,
  MousePointerClick,
  Workflow,
  Layers as LayersIcon,
  Boxes,
  Network,
  Sparkles,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Tab = "help" | "about";

const TAGLINE =
  "Wire logic like circuits, watch it run live, and scale it from a single flow into a federation of connected workflows.";

const SALES_BLURB =
  "LogiTensor is a visual logic engine that turns \"if this then that\" into something you can actually see, drag, and watch execute in real time. Snap together math, AI calls, loops, and conditions like circuit components — no code required. Every workflow lives in its own \"dimension,\" dimensions stack into a 3D-navigable hub, and hubs link into a federation of workflows that can share live data across your entire universe of logic — genuinely multi-dimensional, the way an AI model's tensors are, not just a flat board or a stack of them. Whether you're prototyping an automation, teaching computational thinking, or building a genuinely alive-feeling control system, LogiTensor makes the invisible plumbing of software visible — and fun to build.";

export default function HelpAboutModal({
  tab,
  onTabChange,
  onClose,
}: {
  tab: Tab | null;
  onTabChange: (tab: Tab) => void;
  onClose: () => void;
}) {
  if (!tab) return null;

  return (
    <div
      className="absolute inset-0 bg-zinc-950/90 backdrop-blur-xl z-[60] flex items-center justify-center p-6 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-zinc-900">
          <div className="flex items-center gap-1 bg-zinc-900/70 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => onTabChange("help")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${
                tab === "help" ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Help
            </button>
            <button
              onClick={() => onTabChange("about")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${
                tab === "about" ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              About
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            title="Close"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto scrollbar-thin px-6 py-5">
          {tab === "help" ? <HelpContent /> : <AboutContent />}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-400">{icon}</span>
        <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
      </div>
      <div className="text-xs text-zinc-400 leading-relaxed space-y-1.5 pl-6">{children}</div>
    </div>
  );
}

function HelpContent() {
  return (
    <div>
      <p className="text-xs text-zinc-500 italic mb-6">{TAGLINE}</p>

      <Section icon={<MousePointerClick size={15} />} title="Building a flow">
        <p>
          Drag a node from the left sidebar onto the canvas, or right-click the canvas for the radial
          quick-add menu. Connect a node&apos;s output <b>socket</b> to another&apos;s input by dragging
          between them — amber chevron sockets carry <b>execution triggers</b>, colored circle sockets
          carry <b>data</b> (numbers, text, booleans). A socket only connects to a matching one.
        </p>
        <p>
          Click any unconnected data input to type a static value directly. Press{" "}
          <b>Run Flow</b> (top toolbar) to execute the whole graph, or click a Manual Trigger node&apos;s
          play button to fire just that path. The <b>Delay</b> slider paces each step so you can watch
          execution travel through the wires.
        </p>
      </Section>

      <Section icon={<Workflow size={15} />} title="The node library">
        <p>
          <b>Inputs</b> supply constants and manual triggers. <b>Logic</b> gates (AND/OR/XOR…) combine
          booleans. <b>Control Flow</b> covers If/Else branching, Delay, Counter, and the <b>For</b> /{" "}
          <b>While Loop</b> nodes — a loop fires its Body trigger repeatedly, exposing a live Index or
          Iteration count, then fires Done. <b>Math &amp; Compare</b> includes the <b>Formula</b> node:
          type any expression (<code>a + b * c</code>) over inputs that grow new lettered ports
          automatically as you wire them up — numbers compute, text concatenates. <b>Data &amp; Text</b>{" "}
          holds the <b>Filter</b> node (pass a value through only if it includes/excludes a search term)
          plus text transform/replace. <b>AI &amp; Scripts</b> runs sandboxed Python and queries local
          Ollama LLMs/VLMs. Category headers in the sidebar collapse — click one to tidy the list.
        </p>
      </Section>

      <Section icon={<LayersIcon size={15} />} title="Dimensions (layers)">
        <p>
          Every workflow lives on a <b>dimension</b> — an independent canvas with its own nodes and
          wiring. Open the layer selector (top-right) to add, duplicate, rename, or delete dimensions,
          and step between them with the arrow buttons. Mark any node &quot;multi-dimensional&quot;
          (globe icon) to clone it into every dimension at once: each clone&apos;s inputs are combined
          (numbers sum, booleans OR) into one shared result that broadcasts back to all of them —
          a single Formula node quietly averaging live values from parallel realities.
        </p>
      </Section>

      <Section icon={<Boxes size={15} />} title="The 3D dimension stack">
        <p>
          Click the layer badge to open the full 3D stack: every dimension renders as an x-ray plane
          you can drag to orbit, scroll to zoom, and click to pull forward. Bridged nodes glow and
          connect vertically through the stack so you can literally see a shared value threading
          between dimensions.
        </p>
      </Section>

      <Section icon={<Network size={15} />} title="Federation (hubs)">
        <p>
          Zoom out far enough (or use the Federation toggle) and dimension stacks collapse into{" "}
          <b>hubs</b> — whole workflows floating as glowing cubes. Mark a node as a{" "}
          <b>federation endpoint</b> (network icon) to connect it, by name, to matching endpoints in
          other hubs — a live channel connection you can watch pulse between cubes. Create, duplicate,
          rename, and delete hubs the same way you manage dimensions.
        </p>
      </Section>
    </div>
  );
}

function AboutContent() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.4)] shrink-0">
          <Sparkles className="w-5 h-5 text-zinc-950" />
        </div>
        <div>
          <div className="font-black text-base uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            LogiTensor
          </div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            by Geekatplay Studio
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-300 leading-relaxed mb-5">{SALES_BLURB}</p>

      <div className="text-xs text-zinc-400 leading-relaxed space-y-3 border-t border-zinc-900 pt-4">
        <p>
          <b className="text-zinc-200">Geekatplay Studio</b> builds playful, boundary-pushing creative
          tools — where interactive experiments, generative systems, and hands-on visual programming
          meet. LogiTensor carries that spirit into logic and automation: a canvas-first, execution-first
          way to build systems that stay understandable no matter how large they grow.
        </p>
        <p className="text-zinc-500">
          Under the hood: a Next.js + XYFlow canvas talking to a FastAPI + LangGraph execution backend,
          with a sandboxed Python engine and local Ollama LLM/VLM integration.
        </p>
      </div>

      <a
        href="https://github.com/GeekatplayStudio/LogiTensor"
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 hover:text-amber-400 transition"
      >
        <GitBranch size={13} /> github.com/GeekatplayStudio/LogiTensor
      </a>
    </div>
  );
}
