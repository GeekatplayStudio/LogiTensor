import { describe, it, expect } from "vitest";
import { safeEvaluate, tokenize } from "../safe-evaluator";

describe("Safe Evaluator", () => {
  describe("Tokenizer", () => {
    it("should tokenize simple math expressions", () => {
      const tokens = tokenize("2 + 3.14 * x");
      expect(tokens).toEqual([
        { type: "NUMBER", value: "2" },
        { type: "OPERATOR", value: "+" },
        { type: "NUMBER", value: "3.14" },
        { type: "OPERATOR", value: "*" },
        { type: "IDENTIFIER", value: "x" },
      ]);
    });

    it("should tokenize string literals and booleans", () => {
      const tokens = tokenize("a == 'hello' && b == true");
      expect(tokens).toEqual([
        { type: "IDENTIFIER", value: "a" },
        { type: "OPERATOR", value: "==" },
        { type: "STRING", value: "hello" },
        { type: "OPERATOR", value: "&&" },
        { type: "IDENTIFIER", value: "b" },
        { type: "OPERATOR", value: "==" },
        { type: "BOOLEAN", value: "true" },
      ]);
    });
  });

  describe("safeEvaluate", () => {
    it("should evaluate basic mathematical operations", () => {
      expect(safeEvaluate("1 + 2 * 3")).toBe(7);
      expect(safeEvaluate("(1 + 2) * 3")).toBe(9);
      expect(safeEvaluate("10 - 4 / 2")).toBe(8);
      expect(safeEvaluate("10 % 3")).toBe(1);
    });

    it("should evaluate unary operators", () => {
      expect(safeEvaluate("-5 + 10")).toBe(5);
      expect(safeEvaluate("!true")).toBe(false);
      expect(safeEvaluate("!false")).toBe(true);
      expect(safeEvaluate("-x", { x: 42 })).toBe(-42);
    });

    it("should evaluate logical comparisons", () => {
      expect(safeEvaluate("5 > 3")).toBe(true);
      expect(safeEvaluate("5 >= 5")).toBe(true);
      expect(safeEvaluate("10 < 2")).toBe(false);
      expect(safeEvaluate("4 <= 4")).toBe(true);
      expect(safeEvaluate("3 == 3")).toBe(true);
      expect(safeEvaluate("3 != 3")).toBe(false);
      expect(safeEvaluate("'hello' == 'hello'")).toBe(true);
      expect(safeEvaluate("'hello' != 'world'")).toBe(true);
    });

    it("should evaluate complex logical combinations", () => {
      expect(safeEvaluate("true && false")).toBe(false);
      expect(safeEvaluate("true || false")).toBe(true);
      expect(safeEvaluate("5 > 3 && 2 < 4")).toBe(true);
      expect(safeEvaluate("5 > 3 && 2 > 4")).toBe(false);
      expect(safeEvaluate("!(5 > 3 && 2 > 4)")).toBe(true);
    });

    it("should resolve variables from context", () => {
      const context = { a: 10, b: 5, str: "Geekatplay" };
      expect(safeEvaluate("a > b", context)).toBe(true);
      expect(safeEvaluate("a + b == 15", context)).toBe(true);
      expect(safeEvaluate("str == 'Geekatplay'", context)).toBe(true);
      expect(safeEvaluate("c == null", context)).toBe(true); // undefined resolves to null
    });

    it("should fail gracefully on bad syntax", () => {
      expect(() => safeEvaluate("5 +")).toThrow();
      expect(() => safeEvaluate("(5 + 2")).toThrow();
      expect(() => safeEvaluate("5 == 'foo")).toThrow();
    });
  });
});
