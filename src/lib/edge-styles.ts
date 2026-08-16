// Format edge label text previews
export const formatEdgeValue = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (Array.isArray(val)) return `[${val.length} values]`;
  if (typeof val === "object") return "Object";
  const str = String(val);
  return str.length > 15 ? str.substring(0, 12) + "..." : str;
};

// Connectors stay dim/neutral until something has actually flowed through
// them, then "light up" with their real color and a glow — so at a glance
// you can see which wires are live versus just wired-but-idle.
export const EDGE_IDLE_STROKE = "#52525b";

export function litEdgeStyle(color: string, strokeWidth: number) {
  return {
    stroke: color,
    strokeWidth,
    opacity: 1,
    filter: `drop-shadow(0 0 4px ${color}99)`,
  };
}

export function idleEdgeStyle(strokeWidth: number) {
  return {
    stroke: EDGE_IDLE_STROKE,
    strokeWidth,
    opacity: 0.55,
    filter: undefined,
  };
}

// Single source of truth for the value pill shown on a data edge — used by
// the interactive evaluate path and the backend runAll result path alike, so
// live values look identical no matter which engine produced them.
export function edgeValueLabel(value: any, portColor: string) {
  return {
    label: value !== undefined ? formatEdgeValue(value) : undefined,
    labelBgStyle: { fill: "#18181b", stroke: "#27272a", fillOpacity: 0.95, rx: 4 },
    labelStyle: { fill: portColor, fontSize: 9, fontFamily: "Outfit", fontWeight: "bold" },
  };
}
