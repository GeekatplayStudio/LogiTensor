// Shared muted/pastel palette — desaturated hex tones used consistently across
// the canvas, minimap, sidebar, radial menu, and the 3D stack/federation
// views, so "toned down" reads as one deliberate palette rather than per-file
// guesses. Every hex here is intentionally lower-saturation than a stock
// Tailwind -500 swatch while keeping enough contrast to stay legible.
export const MUTED_COLORS = {
  blue: "#7C93B5", // Inputs / default data
  teal: "#6FA69C", // Logic / boolean data
  purple: "#9285AD", // Control Flow / string data
  amber: "#B99B72", // Math & Compare / trigger sockets
  emerald: "#6FA98A", // Data & Text / number data
  rose: "#AD8288", // Outputs
  violet: "#9483AD", // AI & Scripts
  cyan: "#7FAAB0", // multi-dimensional bridge accent
  fuchsia: "#AD8BB0", // federation accent
  red: "#B57676", // error state
  indigo: "#8686AD", // Neural Network
} as const;

/**
 * Helper utility to return hex colors for node sockets based on their data type.
 */
export const getPortColor = (type: "trigger" | "data", dataType?: string) => {
  if (type === "trigger") return MUTED_COLORS.amber;
  if (dataType === "number") return MUTED_COLORS.emerald;
  if (dataType === "boolean") return MUTED_COLORS.teal;
  if (dataType === "string") return MUTED_COLORS.purple;
  return MUTED_COLORS.blue;
};

/**
 * Returns Tailwind css maps for visual categories.
 *
 * Nodes themselves stay a neutral gray (readability) — only the header band
 * carries the category color, darkened so white node names stay legible.
 * `accent` is a small solid dot for the category indicator only; it must
 * never be applied as a background fill on the whole node.
 */
export const getCategoryStyles = (category: string, selected: boolean) => {
  const styles: Record<string, { headerBg: string; border: string; accent: string }> = {
    Inputs: {
      headerBg: "bg-[#7C93B5]/35 text-zinc-50 border-[#7C93B5]/40",
      border: selected ? "border-[#7C93B5] shadow-[0_0_12px_rgba(124,147,181,0.3)]" : "border-zinc-700",
      accent: "bg-[#7C93B5]",
    },
    Logic: {
      headerBg: "bg-[#6FA69C]/35 text-zinc-50 border-[#6FA69C]/40",
      border: selected ? "border-[#6FA69C] shadow-[0_0_12px_rgba(111,166,156,0.3)]" : "border-zinc-700",
      accent: "bg-[#6FA69C]",
    },
    "Control Flow": {
      headerBg: "bg-[#9285AD]/35 text-zinc-50 border-[#9285AD]/40",
      border: selected ? "border-[#9285AD] shadow-[0_0_12px_rgba(146,133,173,0.3)]" : "border-zinc-700",
      accent: "bg-[#9285AD]",
    },
    "Math & Compare": {
      headerBg: "bg-[#B99B72]/35 text-zinc-50 border-[#B99B72]/40",
      border: selected ? "border-[#B99B72] shadow-[0_0_12px_rgba(185,155,114,0.3)]" : "border-zinc-700",
      accent: "bg-[#B99B72]",
    },
    "Data & Text": {
      headerBg: "bg-[#6FA98A]/35 text-zinc-50 border-[#6FA98A]/40",
      border: selected ? "border-[#6FA98A] shadow-[0_0_12px_rgba(111,169,138,0.3)]" : "border-zinc-700",
      accent: "bg-[#6FA98A]",
    },
    Outputs: {
      headerBg: "bg-[#AD8288]/35 text-zinc-50 border-[#AD8288]/40",
      border: selected ? "border-[#AD8288] shadow-[0_0_12px_rgba(173,130,136,0.3)]" : "border-zinc-700",
      accent: "bg-[#AD8288]",
    },
    "AI & Scripts": {
      headerBg: "bg-[#9483AD]/35 text-zinc-50 border-[#9483AD]/40",
      border: selected ? "border-[#9483AD] shadow-[0_0_12px_rgba(148,131,173,0.3)]" : "border-zinc-700",
      accent: "bg-[#9483AD]",
    },
    "Neural Network": {
      headerBg: "bg-[#8686AD]/35 text-zinc-50 border-[#8686AD]/40",
      border: selected ? "border-[#8686AD] shadow-[0_0_12px_rgba(134,134,173,0.3)]" : "border-zinc-700",
      accent: "bg-[#8686AD]",
    },
    "AI Model": {
      headerBg: "bg-[#7FAAB0]/35 text-zinc-50 border-[#7FAAB0]/40",
      border: selected ? "border-[#7FAAB0] shadow-[0_0_12px_rgba(127,170,176,0.3)]" : "border-zinc-700",
      accent: "bg-[#7FAAB0]",
    },
  };
  return styles[category] || styles.Logic;
};

/**
 * Returns glow and outline styling based on node execution status — a clearly
 * visible glowing ring while running, and one that lingers after success/error
 * so it's obvious which nodes actually ran during the last execution.
 */
export const getExecutionStyles = (state: string = "idle") => {
  const styles: Record<string, string> = {
    idle: "",
    running: "ring-2 ring-[#D8B98A] shadow-[0_0_22px_rgba(216,185,138,0.55)] animate-pulse",
    success: "ring-2 ring-[#8FCBA8] shadow-[0_0_18px_rgba(143,203,168,0.45)] transition-all duration-300",
    error: "ring-2 ring-[#D68F8F] shadow-[0_0_18px_rgba(214,143,143,0.5)]",
  };
  return styles[state] || "";
};
