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
 */
export const getCategoryStyles = (category: string, selected: boolean) => {
  const styles: Record<string, { headerBg: string; border: string; accent: string }> = {
    Inputs: {
      headerBg: "bg-[#7C93B5]/10 text-[#A9BAD3] border-[#7C93B5]/25",
      border: selected ? "border-[#7C93B5] shadow-[0_0_12px_rgba(124,147,181,0.25)]" : "border-[#7C93B5]/15",
      accent: "bg-[#7C93B5]",
    },
    Logic: {
      headerBg: "bg-[#6FA69C]/10 text-[#A0C7BF] border-[#6FA69C]/25",
      border: selected ? "border-[#6FA69C] shadow-[0_0_12px_rgba(111,166,156,0.25)]" : "border-[#6FA69C]/15",
      accent: "bg-[#6FA69C]",
    },
    "Control Flow": {
      headerBg: "bg-[#9285AD]/10 text-[#BCB2CE] border-[#9285AD]/25",
      border: selected ? "border-[#9285AD] shadow-[0_0_12px_rgba(146,133,173,0.25)]" : "border-[#9285AD]/15",
      accent: "bg-[#9285AD]",
    },
    "Math & Compare": {
      headerBg: "bg-[#B99B72]/10 text-[#D3BE9C] border-[#B99B72]/25",
      border: selected ? "border-[#B99B72] shadow-[0_0_12px_rgba(185,155,114,0.25)]" : "border-[#B99B72]/15",
      accent: "bg-[#B99B72]",
    },
    "Data & Text": {
      headerBg: "bg-[#6FA98A]/10 text-[#A2C9B3] border-[#6FA98A]/25",
      border: selected ? "border-[#6FA98A] shadow-[0_0_12px_rgba(111,169,138,0.25)]" : "border-[#6FA98A]/15",
      accent: "bg-[#6FA98A]",
    },
    Outputs: {
      headerBg: "bg-[#AD8288]/10 text-[#CBAEB2] border-[#AD8288]/25",
      border: selected ? "border-[#AD8288] shadow-[0_0_12px_rgba(173,130,136,0.25)]" : "border-[#AD8288]/15",
      accent: "bg-[#AD8288]",
    },
    "AI & Scripts": {
      headerBg: "bg-[#9483AD]/10 text-[#BDB0CE] border-[#9483AD]/25",
      border: selected ? "border-[#9483AD] shadow-[0_0_12px_rgba(148,131,173,0.25)]" : "border-[#9483AD]/15",
      accent: "bg-[#9483AD]",
    },
  };
  return styles[category] || styles.Logic;
};

/**
 * Returns glow and outline styling based on node execution status.
 */
export const getExecutionStyles = (state: string = "idle") => {
  const styles: Record<string, string> = {
    idle: "",
    running: "ring-1 ring-[#B99B72] shadow-[0_0_14px_rgba(185,155,114,0.35)] animate-pulse",
    success: "ring-1 ring-[#6FA98A] shadow-[0_0_14px_rgba(111,169,138,0.3)] transition-all duration-300",
    error: "ring-1 ring-[#B57676] shadow-[0_0_14px_rgba(181,118,118,0.35)]",
  };
  return styles[state] || "";
};
