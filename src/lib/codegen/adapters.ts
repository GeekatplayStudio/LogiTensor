// Derived-language targets: deterministic line adapters over the JavaScript
// emission (the ash-mesh jsLineToC approach). Each adapter is a rule table +
// honest TODO bailouts for constructs it can't map — no LLM, fully offline.
// JS is the source because its expression syntax is already C-family-shaped.

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

// String methods, template literals, and JS-runtime idioms have no mechanical
// mapping in the C family — those lines bail to TODOs rather than emit code
// that looks right but doesn't compile.
const C_BAILS = [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /\[\.\.\./, /`/];

function toCFamily(js: string, lang: "c" | "cpp"): string {
  const body = js
    .split("\n")
    .filter((l) => !l.startsWith("const sleep =") && !l.startsWith("main();"))
    .map((l) => adaptLine(l, SHARED_C_FAMILY, C_BAILS, `port to ${lang.toUpperCase()} by hand`))
    .join("\n");
  const header =
    lang === "c"
      ? "#include <stdio.h>\n#include <stdlib.h>\n#include <math.h>\n\n// helpers expected by the generated flow\n// void sleep_ms(double ms); void print_value(...);\n"
      : "#include <iostream>\n#include <cmath>\n#include <string>\n\n// helpers expected by the generated flow\n// void sleep_ms(double ms); template<class T> void print_value(T v){ std::cout << v << \"\\n\"; }\n";
  return `${header}\n${body}\nint main() { main_flow(); return 0; }\n`;
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

function toGo(js: string): string {
  const body = js
    .split("\n")
    .filter((l) => !l.startsWith("const sleep =") && !l.startsWith("main();"))
    .map((l) => adaptLine(l, GO_RULES, [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /`/], "port to Go by hand"))
    .join("\n")
    .replace(/\basync function main\(\) \{/g, "func mainFlow() {");
  return `package main\n\nimport (\n\t"fmt"\n\t"math"\n\t"time"\n)\n\n${body}\n\nfunc main() { mainFlow() }\n`;
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

function toRust(js: string): string {
  const body = js
    .split("\n")
    .filter((l) => !l.startsWith("const sleep =") && !l.startsWith("main();"))
    .map((l) => adaptLine(l, RUST_RULES, [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /\bMath\./, /`/], "port to Rust by hand"))
    .join("\n")
    .replace(/\bfn main\(\) \{/g, "fn main_flow() {");
  return `${body}\n\nfn main() { main_flow(); }\n`;
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

function toPhp(js: string): string {
  const body = js
    .split("\n")
    .filter((l) => !l.startsWith("const sleep =") && !l.startsWith("main();"))
    .map((l) => adaptLine(l, PHP_RULES, [/\.(split|join|includes|toUpperCase|toLowerCase|trim|indexOf)\(/, /=>/, /\bfetch\(/, /JSON\./, /`/], "port to PHP by hand"))
    .join("\n")
    .replace(/\bfunction main\(\) \{/g, "function main_flow() {");
  return `<?php\n\n${body}\n\nmain_flow();\n`;
}

export function adaptFromJs(js: string, target: string): string {
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
