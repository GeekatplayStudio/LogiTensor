// Interprets a data value flowing into a trigger port (see the "hybrid
// trigger" connection exception in use-node-editor-store.ts's onConnect) as
// on/off — true triggers, false is ignored; numbers above 0 trigger, 0 (and
// negatives) are ignored; anything else falls back to a truthy check so an
// "any"-typed port still works.
export function resolveTriggerFire(rawValue: any): boolean {
  if (typeof rawValue === "boolean") return rawValue;
  if (rawValue === null || rawValue === undefined) return false;
  const n = Number(rawValue);
  if (!isNaN(n)) return n > 0;
  return Boolean(rawValue);
}
