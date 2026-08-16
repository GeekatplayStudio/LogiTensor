import type { LanguageProfile } from "./types";

// The two native emission languages. All other targets are derived from the
// JavaScript emission through line adapters (adapters.ts).

export const jsProfile: LanguageProfile = {
  id: "javascript",
  bool: (b) => (b ? "true" : "false"),
  nil: "null",
  not: (e) => `!(${e})`,
  and: (a, b) => `(${a} && ${b})`,
  or: (a, b) => `(${a} || ${b})`,
  ternary: (cond, a, b) => `(${cond} ? ${a} : ${b})`,
  num: (e) => `Number(${e})`,
  str: (e) => `String(${e})`,
  print: (e) => `console.log(${e});`,
  sleepMs: (e) => `await sleep(${e});`,
  comment: (text) => `// ${text}`,
  emptyBody: "// (empty)",
  declare: (name, expr) => `let ${name} = ${expr};`,
  assign: (name, expr) => `${name} = ${expr};`,
  defLine: (name, params) => `async function ${name}(${params.join(", ")}) {`,
  ifLine: (cond) => `if (${cond}) {`,
  elseLine: "} else {",
  forRange: (v, count) => `for (let ${v} = 0; ${v} < ${count}; ${v}++) {`,
  whileLine: (cond) => `while (${cond}) {`,
  blockClose: "}",
  callStmt: (name, args) => `await ${name}(${args.join(", ")});`,
  strLen: (e) => `${e}.length`,
  strUpper: (e) => `${e}.toUpperCase()`,
  strLower: (e) => `${e}.toLowerCase()`,
  strTrim: (e) => `${e}.trim()`,
  strReverse: (e) => `[...${e}].reverse().join("")`,
  strIncludes: (hay, needle) => `${hay}.includes(${needle})`,
  strReplaceAll: (text, find, repl) => `${text}.split(${find}).join(${repl})`,
  mathFn: (op, a, b) => {
    // mod mirrors execution-helpers.ts: mathematical modulo, 0 when b is 0.
    if (op === "mod") return `(${b} === 0 ? 0 : ((${a} % ${b}) + ${b}) % ${b})`;
    if (op === "pow" || op === "min" || op === "max") return `Math.${op}(${a}, ${b})`;
    return `Math.${op}(${a})`;
  },
  maxOf: (items) => `Math.max(${items.join(", ")})`,
  absNeg: (e) => `-Math.abs(${e})`,
  randomInt: (min, max) => `(Math.floor(Math.random() * ((${max}) - (${min}) + 1)) + (${min}))`,
};

export const pyProfile: LanguageProfile = {
  id: "python",
  bool: (b) => (b ? "True" : "False"),
  nil: "None",
  not: (e) => `(not (${e}))`,
  and: (a, b) => `(${a} and ${b})`,
  or: (a, b) => `(${a} or ${b})`,
  ternary: (cond, a, b) => `(${a} if ${cond} else ${b})`,
  num: (e) => `float(${e})`,
  str: (e) => `str(${e})`,
  print: (e) => `print(${e})`,
  sleepMs: (e) => `time.sleep((${e}) / 1000.0)`,
  comment: (text) => `# ${text}`,
  emptyBody: "pass",
  declare: (name, expr) => `${name} = ${expr}`,
  assign: (name, expr) => `${name} = ${expr}`,
  defLine: (name, params) => `def ${name}(${params.join(", ")}):`,
  ifLine: (cond) => `if ${cond}:`,
  elseLine: "else:",
  forRange: (v, count) => `for ${v} in range(int(${count})):`,
  whileLine: (cond) => `while ${cond}:`,
  blockClose: "",
  callStmt: (name, args) => `${name}(${args.join(", ")})`,
  strLen: (e) => `len(${e})`,
  strUpper: (e) => `${e}.upper()`,
  strLower: (e) => `${e}.lower()`,
  strTrim: (e) => `${e}.strip()`,
  strReverse: (e) => `${e}[::-1]`,
  strIncludes: (hay, needle) => `(${needle} in ${hay})`,
  strReplaceAll: (text, find, repl) => `${text}.replace(${find}, ${repl})`,
  mathFn: (op, a, b) => {
    if (op === "mod") return `(0 if ${b} == 0 else ((${a} % ${b}) + ${b}) % ${b})`;
    if (op === "pow") return `(${a} ** ${b})`;
    if (op === "min" || op === "max") return `${op}(${a}, ${b})`;
    if (op === "round") return `round(${a})`;
    if (op === "abs") return `abs(${a})`;
    return `math.${op}(${a})`; // floor, ceil, sqrt
  },
  maxOf: (items) => `max(${items.join(", ")})`,
  absNeg: (e) => `-abs(${e})`,
  randomInt: (min, max) => `random.randint(int(${min}), int(${max}))`,
};

/** Literal for a static port value in the given language. */
export function literal(profile: LanguageProfile, v: unknown): string {
  if (v === null || v === undefined) return profile.nil;
  if (typeof v === "boolean") return profile.bool(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => literal(profile, x)).join(", ")}]`;
  return JSON.stringify(String(v));
}
