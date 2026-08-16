// Derived-language targets: deterministic line adapters over the JavaScript
// emission (the ash-mesh jsLineToC approach). Each adapter is a rule table +
// honest TODO bailouts for constructs it can't map — no LLM, fully offline.
// JS is the source because its expression syntax is already C-family-shaped.
//
// Adapters work on CodeLine[], not a raw string: they drop lines (the JS-only
// `const sleep =` / `main();`) and prepend headers, so per-line node
// attribution has to travel with the text rather than be re-derived from a
// line index afterwards.

import type { CodeLine } from "./types";
import { tag } from "./lines";

interface AdapterRule {
  from: RegExp;
  to: string;
}

const SHARED_C_FAMILY: AdapterRule[] = [
  { from: /\basync function (\w+)\(\) \{/g, to: "void $1() {" },
  { from: /\basync function main\(\) \{/g, to: "void main_flow() {" },
  { from: /\bawait sleep\(([^;]+)\);/g, to: "sleep_ms($1);" },
  { from: /\bawait /g, to: "" },
  { from: /\bconsole\.log\(/g, to: "print_value(" },
  { from: /\blet (\w+) = /g, to: "auto $1 = " },
  { from: /\bconst (\w+) = /g, to: "const auto $1 = " },
  { from: /!==/g, to: "!=" },
  { from: /===/g, to: "==" },
  { from: /\bMath\.(abs|min|max|floor|ceil|sqrt|pow|round)\b/g, to: "$1" },
  { from: /\bNumber\(/g, to: "(double)(" },
  { from: /\bString\(/g, to: "to_string(" },
  { from: /\bnull\b/g, to: "NULL" },
  { from: /\btrue\b/g, to: "true" },
  { from: /\bfalse\b/g, to: "false" },
];

function adaptLine(line: string, rules: AdapterRule[], bailPatterns: RegExp[], todo: string): string {
  const trimmed = line.trimStart();
  const pad = line.slice(0, line.length - trimmed.length);
  if (trimmed.startsWith("//")) return line;
  for (const bail of bailPatterns) {
    if (bail.test(trimmed)) return `${pad}// TODO(${todo}): ${trimmed}`;
  }
  let out = line;
  for (const rule of rules) out = out.replace(rule.from, rule.to);
  return out;
}

/**
 * Shared body pass for every derived target: drop the JS-only bootstrap lines,
 * rewrite each remaining one, and carry its nodeId across untouched. `post` is
 * the per-target fixup that previously ran on the joined string — every one of
 * them is line-local, so running it per line is equivalent.
 */
function adaptBody(
  js: CodeLine[],
  rules: AdapterRule[],
  bails: RegExp[],
  todo: string,
  post: (line: string) => string = (l) => l,
): CodeLine[] {
  // The JS emission's text always ends with a newline, so the previous
  // string-based `split("\n")` yielded one extra empty final line. Derived
  // targets' spacing depends on it, so reproduce it explicitly (untagged).
  return [...js, { text: "" }]
    .filter((l) => !l.text.startsWith("const sleep =") && !l.text.startsWith("main();"))
    .map((l) => ({ ...l, text: post(adaptLine(l.text, rules, bails, todo)) }));
}

// String methods, template literals, and JS-runtime idioms have no mechanical
// mapping in the C family — those lines bail to TODOs rather than emit code
// that looks right but doesn't compile.
const C_BAILS = [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /\[\.\.\./, /`/];

const C_HEADER = [
  "#include <stdio.h>",
  "#include <stdlib.h>",
  "#include <math.h>",
  "",
  "// helpers expected by the generated flow",
  "// void sleep_ms(double ms); void print_value(...);",
  "",
];

const CPP_HEADER = [
  "#include <iostream>",
  "#include <cmath>",
  "#include <string>",
  "",
  "// helpers expected by the generated flow",
  '// void sleep_ms(double ms); template<class T> void print_value(T v){ std::cout << v << "\\n"; }',
  "",
];

function toCFamily(js: CodeLine[], lang: "c" | "cpp"): CodeLine[] {
  const body = adaptBody(js, SHARED_C_FAMILY, C_BAILS, `port to ${lang.toUpperCase()} by hand`);
  return [...tag(lang === "c" ? C_HEADER : CPP_HEADER), ...body, ...tag(["int main() { main_flow(); return 0; }"])];
}

const GO_RULES: AdapterRule[] = [
  { from: /\basync function (\w+)\(\) \{/g, to: "func $1() {" },
  { from: /\bawait sleep\(([^;]+)\);/g, to: "time.Sleep(time.Duration($1) * time.Millisecond)" },
  { from: /\bawait /g, to: "" },
  { from: /\bconsole\.log\(([^;]*)\);/g, to: "fmt.Println($1)" },
  { from: /\blet (\w+) = /g, to: "$1 := " },
  { from: /(\w+) = (.*);$/g, to: "$1 = $2" },
  { from: /!==/g, to: "!=" },
  { from: /===/g, to: "==" },
  { from: /\bMath\.(floor|ceil|sqrt|abs|pow|min|max)\b/g, to: "math.$1" },
  { from: /\bNumber\(/g, to: "float64(" },
  { from: /\bnull\b/g, to: "nil" },
  { from: /;$/g, to: "" },
];

const GO_BAILS = [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /`/];

const GO_HEADER = ["package main", "", "import (", '\t"fmt"', '\t"math"', '\t"time"', ")", ""];

function toGo(js: CodeLine[]): CodeLine[] {
  const body = adaptBody(js, GO_RULES, GO_BAILS, "port to Go by hand", (l) =>
    l.replace(/\basync function main\(\) \{/g, "func mainFlow() {"),
  );
  return [...tag(GO_HEADER), ...body, ...tag(["", "func main() { mainFlow() }"])];
}

const RUST_RULES: AdapterRule[] = [
  { from: /\basync function (\w+)\(\) \{/g, to: "fn $1() {" },
  { from: /\bawait sleep\(([^;]+)\);/g, to: "std::thread::sleep(std::time::Duration::from_millis(($1) as u64));" },
  { from: /\bawait /g, to: "" },
  { from: /\bconsole\.log\(([^;]*)\);/g, to: 'println!("{:?}", $1);' },
  { from: /\blet (\w+) = /g, to: "let mut $1 = " },
  { from: /!==/g, to: "!=" },
  { from: /===/g, to: "==" },
  { from: /\bMath\.abs\(([^)]*)\)/g, to: "($1_f64).abs()" },
  { from: /\bNumber\(/g, to: "(" },
  { from: /\bnull\b/g, to: "None::<f64>" },
];

const RUST_BAILS = [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /\bMath\./, /`/];

function toRust(js: CodeLine[]): CodeLine[] {
  const body = adaptBody(js, RUST_RULES, RUST_BAILS, "port to Rust by hand", (l) =>
    l.replace(/\bfn main\(\) \{/g, "fn main_flow() {"),
  );
  return [...body, ...tag(["", "fn main() { main_flow(); }"])];
}

const PHP_RULES: AdapterRule[] = [
  { from: /\basync function (\w+)\(\) \{/g, to: "function $1() {" },
  { from: /\bawait sleep\(([^;]+)\);/g, to: "usleep((int)(($1) * 1000));" },
  { from: /\bawait /g, to: "" },
  { from: /\bconsole\.log\(([^;]*)\);/g, to: "var_dump($1);" },
  { from: /\blet (\w+)/g, to: "$$$1" },
  { from: /^(\s*)(\w+) = /gm, to: "$1$$$2 = " },
  { from: /\bMath\.(abs|min|max|floor|ceil|sqrt|pow|round)\b/g, to: "$1" },
  { from: /\bNumber\(/g, to: "floatval(" },
  { from: /\bString\(/g, to: "strval(" },
  { from: /!==/g, to: "!==" },
];

const PHP_BAILS = [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /`/];

function toPhp(js: CodeLine[]): CodeLine[] {
  const body = adaptBody(js, PHP_RULES, PHP_BAILS, "port to PHP by hand", (l) =>
    l.replace(/\bfunction main\(\) \{/g, "function main_flow() {"),
  );
  return [...tag(["<?php", ""]), ...body, ...tag(["", "main_flow();"])];
}

export function adaptFromJs(js: CodeLine[], target: string): CodeLine[] {
  switch (target) {
    case "c":
      return toCFamily(js, "c");
    case "cpp":
      return toCFamily(js, "cpp");
    case "go":
      return toGo(js);
    case "rust":
      return toRust(js);
    case "php":
      return toPhp(js);
    default:
      return js;
  }
}
