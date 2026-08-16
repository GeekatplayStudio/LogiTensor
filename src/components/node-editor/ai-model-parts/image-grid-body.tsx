import React, { useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";

// Visual body for the Image Input Grid node. Split out of
// ai-model-node-parts.tsx to keep each file under the repo's module size
// guardrail.

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
