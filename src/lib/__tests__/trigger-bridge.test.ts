import { describe, it, expect } from "vitest";
import { resolveTriggerFire } from "../trigger-bridge";

describe("resolveTriggerFire", () => {
  it("reads booleans directly", () => {
    expect(resolveTriggerFire(true)).toBe(true);
    expect(resolveTriggerFire(false)).toBe(false);
  });

  it("treats positive numbers as on; zero and negatives as off", () => {
    expect(resolveTriggerFire(1)).toBe(true);
    expect(resolveTriggerFire(0.5)).toBe(true);
    expect(resolveTriggerFire(0)).toBe(false);
    expect(resolveTriggerFire(-2)).toBe(false);
  });

  it("treats null/undefined as off", () => {
    expect(resolveTriggerFire(null)).toBe(false);
    expect(resolveTriggerFire(undefined)).toBe(false);
  });

  it("falls back to a truthy check for non-numeric values", () => {
    expect(resolveTriggerFire("hello")).toBe(true);
    expect(resolveTriggerFire("")).toBe(false);
  });
});
