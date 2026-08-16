// Small shared coercions used by the newer pure nodes (list, text and math
// helpers). Kept separate from execution-helpers.ts so that file stays under
// the repo's 500-line module guardrail.

/** Coerces any port value into an array. JSON array text is parsed so a
 * stringified list arriving from a script node still behaves like a list;
 * anything else becomes a single-element list. */
export function toList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not JSON after all — fall through and treat it as a single item.
      }
    }
  }
  return [value];
}

/** Number conversion that never yields NaN — used wherever a node must keep
 * producing a usable number rather than poisoning downstream math. */
export function toNum(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** String conversion matching what users expect on the canvas: objects and
 * lists render as JSON, null/undefined render as empty. */
export function toStr(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Truthiness that understands text: "false", "no", "0" and "" all read as
 * false, so a boolean typed into a string port behaves as written. */
export function toBool(value: any): boolean {
  if (typeof value !== "string") return Boolean(value);
  const t = value.trim().toLowerCase();
  return !(t === "" || t === "false" || t === "0" || t === "no");
}
