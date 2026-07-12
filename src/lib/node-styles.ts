/**
 * Helper utility to return hex colors for node sockets based on their data type.
 */
export const getPortColor = (type: "trigger" | "data", dataType?: string) => {
  if (type === "trigger") return "#f59e0b"; // amber
  if (dataType === "number") return "#10b981"; // emerald
  if (dataType === "boolean") return "#14b8a6"; // teal
  if (dataType === "string") return "#a78bfa"; // purple
  return "#3b82f6"; // blue
};

/**
 * Returns Tailwind css maps for visual categories.
 */
export const getCategoryStyles = (category: string, selected: boolean) => {
  const styles: Record<string, { headerBg: string; border: string; accent: string }> = {
    Inputs: {
      headerBg: "bg-blue-500/10 text-blue-300 border-blue-500/30",
      border: selected ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]" : "border-blue-500/20",
      accent: "bg-blue-500",
    },
    Logic: {
      headerBg: "bg-teal-500/10 text-teal-300 border-teal-500/30",
      border: selected ? "border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.3)]" : "border-teal-500/20",
      accent: "bg-teal-500",
    },
    "Control Flow": {
      headerBg: "bg-purple-500/10 text-purple-300 border-purple-500/30",
      border: selected ? "border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "border-purple-500/20",
      accent: "bg-purple-500",
    },
    "Math & Compare": {
      headerBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      border: selected ? "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "border-amber-500/20",
      accent: "bg-amber-500",
    },
    "Data & Text": {
      headerBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      border: selected ? "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "border-emerald-500/20",
      accent: "bg-emerald-500",
    },
    Outputs: {
      headerBg: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      border: selected ? "border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "border-rose-500/20",
      accent: "bg-rose-500",
    },
    "AI & Scripts": {
      headerBg: "bg-violet-500/10 text-violet-300 border-violet-500/30",
      border: selected ? "border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.3)]" : "border-violet-500/20",
      accent: "bg-violet-500",
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
    running: "ring-2 ring-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)] animate-pulse",
    success: "ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all duration-300",
    error: "ring-2 ring-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]",
  };
  return styles[state] || "";
};
