import React, { useEffect, useRef } from "react";
import { useNodeEditorStore } from "./use-node-editor-store";
import { generateWeights } from "@/lib/execution-helpers";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";

// Visual bodies for the AI Model node group (Image Input Grid, Dense Layer,
// Output Layer). Split out of custom-nodes.tsx to keep that file under the
// repo's module size guardrail.

// Downscales the uploaded image to an N×N grid and reads back one averaged
// color + luminosity per cell — the canvas's own drawImage scaling does the
// area-averaging ("pixelation") for us.
function pixelate(src: string, grid: number): Promise<{ colors: string[]; values: number[] }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = grid;
      c.height = grid;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, grid, grid);
      const d = ctx.getImageData(0, 0, grid, grid).data;
      const colors: string[] = [];
      const values: number[] = [];
      for (let i = 0; i < grid * grid; i++) {
        const r = d[i * 4];
        const g = d[i * 4 + 1];
        const b = d[i * 4 + 2];
        colors.push(`rgb(${r},${g},${b})`);
        // Rec. 709 luminosity, normalized 0–1
        values.push(Number(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toFixed(4)));
      }
      resolve({ colors, values });
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

const GRID_OPTIONS = [4, 8, 12, 16, 24, 32];

export function ImageGridBody({
  data,
  onConfigChange,
}: {
  data: any;
  onConfigChange: (key: string, val: any) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const gridSize = Number(data.config?.gridSize ?? 8);
  const imageSrc: string = data.config?.imageSrc ?? "";
  const colors: string[] = Array.isArray(data.config?.cellColors) ? data.config.cellColors : [];

  // Re-pixelate whenever the stored image or grid size no longer matches the
  // cached cells (covers grid-size changes and project reloads).
  useEffect(() => {
    if (!imageSrc) return;
    if (colors.length === gridSize * gridSize) return;
    pixelate(imageSrc, gridSize)
      .then(({ colors, values }) => {
        onConfigChange("cellColors", colors);
        onConfigChange("cellValues", values);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, gridSize, colors.length]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Keep only a small square copy in config so saved projects stay light
        // but re-gridding at any size remains possible.
        const c = document.createElement("canvas");
        c.width = 96;
        c.height = 96;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 96, 96);
        onConfigChange("imageSrc", c.toDataURL("image/jpeg", 0.7));
        onConfigChange("imageName", file.name);
        // Invalidate cached cells; the effect above re-pixelates.
        onConfigChange("cellColors", []);
        onConfigChange("cellValues", []);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="px-3.5 pb-2.5 space-y-2 nodrag">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] text-zinc-400">Grid</Label>
        <select
          value={gridSize}
          onChange={(e) => onConfigChange("gridSize", Number(e.target.value))}
          className="h-6 text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-200 rounded px-1"
        >
          {GRID_OPTIONS.map((g) => (
            <option key={g} value={g}>{g} × {g}</option>
          ))}
        </select>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 h-6 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 transition"
          title="Upload an image to map onto the grid"
        >
          <Upload size={10} /> Image
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {colors.length === gridSize * gridSize ? (
        <div
          className="w-full rounded border border-zinc-800 overflow-hidden"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            aspectRatio: "1 / 1",
          }}
          title={`${gridSize}×${gridSize} = ${gridSize * gridSize} input values (avg color + luminosity per cell)`}
        >
          {colors.map((col, i) => (
            <div key={i} style={{ backgroundColor: col }} />
          ))}
        </div>
      ) : (
        <div className="w-full aspect-square rounded border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
          {imageSrc ? "Processing…" : "Upload an image"}
        </div>
      )}

      {data.config?.imageName && (
        <p className="text-[9px] text-zinc-600 truncate">
          {data.config.imageName} → {gridSize * gridSize} values
        </p>
      )}
    </div>
  );
}

// Caps how many dots each column draws so the web stays readable; the counts
// caption still reports the real totals.
const MAX_DOTS = 10;

export function DenseLayerBody({ id, data }: { id: string; data: any }) {
  // Resolve the live incoming vector from whatever is wired into "in".
  const incoming = useNodeEditorStore((s) => {
    const edge = s.edges.find((e) => e.target === id && e.targetHandle === "in");
    if (!edge) return undefined;
    const src = s.nodes.find((n) => n.id === edge.source);
    return src?.data.outputs.find((o) => o.id === edge.sourceHandle)?.value;
  });

  const xs: number[] = Array.isArray(incoming) ? incoming.map(Number) : [];
  const neurons = Math.max(1, Math.min(64, Math.floor(Number(data.config?.neurons ?? 8) || 1)));
  const seed = Math.floor(Number(data.config?.seed ?? 42) || 0);
  const activations: number[] = Array.isArray(
    data.outputs?.find((o: any) => o.id === "out")?.value
  )
    ? data.outputs.find((o: any) => o.id === "out").value
    : [];

  const shownIn = Math.min(xs.length, MAX_DOTS);
  const shownOut = Math.min(neurons, MAX_DOTS);
  const weights = shownIn > 0 ? generateWeights(seed, xs.length, neurons) : [];

  const H = Math.max(shownIn, shownOut, 1) * 18 + 8;
  const yIn = (i: number) => 12 + i * ((H - 24) / Math.max(shownIn - 1, 1));
  const yOut = (j: number) => 12 + j * ((H - 24) / Math.max(shownOut - 1, 1));

  return (
    <div className="px-3.5 pb-2.5 space-y-1">
      {shownIn > 0 ? (
        <svg width="100%" viewBox={`0 0 190 ${H}`} className="bg-zinc-950/60 rounded border border-zinc-900">
          {/* weight web: one line per (shown) input × neuron pair */}
          {Array.from({ length: shownIn }).map((_, i) =>
            Array.from({ length: shownOut }).map((_, j) => {
              const w = weights[j]?.[i] ?? 0;
              return (
                <line
                  key={`${i}-${j}`}
                  x1={20}
                  y1={yIn(i)}
                  x2={170}
                  y2={yOut(j)}
                  stroke={w >= 0 ? "#B99B72" : "#6FA69C"}
                  strokeWidth={1}
                  opacity={0.15 + Math.min(1, Math.abs(w)) * 0.75}
                />
              );
            })
          )}
          {/* input dots: brightness = incoming value */}
          {Array.from({ length: shownIn }).map((_, i) => {
            const v = Math.max(0, Math.min(1, xs[i] ?? 0));
            return (
              <circle key={`in${i}`} cx={20} cy={yIn(i)} r={4.5}
                fill={`rgb(${90 + v * 130},${110 + v * 120},${150 + v * 80})`} />
            );
          })}
          {/* neuron dots: brightness = activation */}
          {Array.from({ length: shownOut }).map((_, j) => {
            const v = Math.max(0, Math.min(1, activations[j] ?? 0));
            return (
              <circle key={`out${j}`} cx={170} cy={yOut(j)} r={4.5}
                fill={`rgb(${120 + v * 115},${100 + v * 90},${60 + v * 60})`} />
            );
          })}
        </svg>
      ) : (
        <div className="h-14 rounded border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
          Wire values in to grow the web
        </div>
      )}
      <p className="text-[9px] text-zinc-600 leading-tight">
        {xs.length} inputs × {neurons} neurons = {xs.length * neurons} weights
        {xs.length > MAX_DOTS || neurons > MAX_DOTS ? ` (showing ${shownIn}×${shownOut})` : ""}
      </p>
    </div>
  );
}

export function OutputLayerBody({ id, data }: { id: string; data: any }) {
  const incoming = useNodeEditorStore((s) => {
    const edge = s.edges.find((e) => e.target === id && e.targetHandle === "in");
    if (!edge) return undefined;
    const src = s.nodes.find((n) => n.id === edge.source);
    return src?.data.outputs.find((o) => o.id === edge.sourceHandle)?.value;
  });

  const xs: number[] = Array.isArray(incoming) ? incoming.map(Number) : [];
  const winner = data.outputs?.find((o: any) => o.id === "winner")?.value ?? -1;
  const shown = xs.slice(0, 16);
  const max = Math.max(...shown.map((v) => Math.abs(v)), 0.0001);

  return (
    <div className="px-3.5 pb-2.5 space-y-1">
      {shown.length > 0 ? (
        <div className="space-y-0.5 bg-zinc-950/60 rounded border border-zinc-900 p-1.5">
          {shown.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`w-4 text-right font-mono text-[8px] ${i === winner ? "text-[#D8B98A] font-bold" : "text-zinc-600"}`}>
                {i}
              </span>
              <div className="flex-1 h-2 bg-zinc-900 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(Math.abs(v) / max) * 100}%`,
                    backgroundColor: i === winner ? "#D8B98A" : "#7C93B5",
                  }}
                />
              </div>
              <span className="w-8 font-mono text-[8px] text-zinc-500">{v.toFixed(2)}</span>
            </div>
          ))}
          {xs.length > 16 && (
            <p className="text-[8px] text-zinc-600">…{xs.length - 16} more</p>
          )}
        </div>
      ) : (
        <div className="h-10 rounded border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
          Wire activations in
        </div>
      )}
      {winner >= 0 && (
        <p className="text-[9px] text-zinc-500">
          Winner: neuron <span className="font-mono font-bold text-[#D8B98A]">{winner}</span>
        </p>
      )}
    </div>
  );
}
