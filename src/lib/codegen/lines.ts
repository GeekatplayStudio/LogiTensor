import type { CodeLine } from "./types";

// Small vocabulary for building tagged line lists. Kept in its own module so
// emitters (chains/assemble) and the derived-target adapters share exactly one
// definition of "text + owning node", and `code` stays a pure function of it.

/** Tag plain statement text with the node that produced it. */
export function tag(texts: string[], nodeId?: string): CodeLine[] {
  return texts.map((text) => ({ text, nodeId }));
}

/** Prefix every line with one indent unit, preserving attribution. */
export function indentLines(lines: CodeLine[], unit: string): CodeLine[] {
  return lines.map((l) => (l.text === "" ? l : { ...l, text: unit + l.text }));
}

/** The joined program text. The single place `code` is produced. */
export function joinLines(lines: CodeLine[]): string {
  return lines.map((l) => l.text).join("\n") + "\n";
}
