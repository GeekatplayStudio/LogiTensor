import type { LanguageProfile } from "./types";

// Generated-program runtime helpers. The node emitters stay language-neutral
// (see LanguageProfile) by calling these by name; the *bodies* are the only
// place a construct is spelled per language, exactly like profiles.ts.
//
// Each body mirrors a runtime module so generated code behaves like the
// canvas: node-value-utils.ts / values.py (coercions), extra-node-compute.ts /
// extra.py (text + JSON + regex), list-node-compute.ts / lists.py (lists).

export type RuntimeHelper =
  | "lb_to_str"
  | "lb_to_num"
  | "lb_to_bool"
  | "lb_to_list"
  | "lb_loose_eq"
  | "lb_split"
  | "lb_join"
  | "lb_substring"
  | "lb_json_parse"
  | "lb_json_stringify"
  | "lb_regex_match"
  | "lb_list_get"
  | "lb_list_stats"
  | "lb_list_sort"
  | "lb_list_slice"
  | "lb_list_contains";

/** Helpers each helper calls — pulled in transitively by requireHelper. */
const HELPER_DEPS: Record<RuntimeHelper, RuntimeHelper[]> = {
  lb_to_str: [],
  lb_to_num: [],
  lb_to_bool: [],
  lb_to_list: [],
  lb_loose_eq: [],
  lb_split: ["lb_to_str"],
  lb_join: ["lb_to_str", "lb_to_list"],
  lb_substring: ["lb_to_str", "lb_to_num"],
  lb_json_parse: ["lb_to_str"],
  lb_json_stringify: [],
  lb_regex_match: ["lb_to_str"],
  lb_list_get: ["lb_to_list", "lb_to_num"],
  lb_list_stats: ["lb_to_list"],
  lb_list_sort: ["lb_to_list", "lb_to_num", "lb_to_str"],
  lb_list_slice: ["lb_to_list", "lb_to_num"],
  lb_list_contains: ["lb_to_list", "lb_to_str"],
};

const JS_HELPERS: Record<RuntimeHelper, string[]> = {
  lb_to_str: [
    "function lb_to_str(v) {",
    '  if (v === null || v === undefined) return "";',
    '  if (typeof v === "object") return JSON.stringify(v);',
    "  return String(v);",
    "}",
  ],
  lb_to_num: [
    "function lb_to_num(v) {",
    "  const n = Number(v);",
    "  return Number.isFinite(n) ? n : 0;",
    "}",
  ],
  lb_to_bool: [
    "function lb_to_bool(v) {",
    '  if (typeof v !== "string") return Boolean(v);',
    "  const t = v.trim().toLowerCase();",
    '  return !(t === "" || t === "false" || t === "0" || t === "no");',
    "}",
  ],
  lb_to_list: [
    "function lb_to_list(v) {",
    "  if (Array.isArray(v)) return v;",
    '  if (v === null || v === undefined || v === "") return [];',
    '  if (typeof v === "string" && v.trim().startsWith("[")) {',
    "    try {",
    "      const parsed = JSON.parse(v);",
    "      if (Array.isArray(parsed)) return parsed;",
    "    } catch {",
    "      // not JSON after all — fall through and treat it as a single item",
    "    }",
    "  }",
    "  return [v];",
    "}",
  ],
  lb_loose_eq: [
    "function lb_loose_eq(a, b) {",
    "  // numeric-looking text compares as a number, so \"5\" matches 5",
    '  const c = (v) => (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : v);',
    "  return c(a) == c(b);",
    "}",
  ],
  lb_split: [
    "function lb_split(text, delim) {",
    "  const s = lb_to_str(text);",
    "  const d = lb_to_str(delim);",
    '  return d === "" ? [...s] : s.split(d);',
    "}",
  ],
  lb_join: [
    "function lb_join(list, delim) {",
    "  return lb_to_list(list).map(lb_to_str).join(lb_to_str(delim));",
    "}",
  ],
  lb_substring: [
    "function lb_substring(text, start, length) {",
    "  const s = lb_to_str(text);",
    "  const raw = Math.trunc(lb_to_num(start));",
    "  const from = raw < 0 ? Math.max(0, s.length + raw) : raw;",
    "  const n = Math.max(0, Math.trunc(lb_to_num(length)));",
    "  return s.slice(from, from + n);",
    "}",
  ],
  lb_json_parse: [
    "// returns [parsed value, valid]",
    "function lb_json_parse(text) {",
    "  try {",
    "    return [JSON.parse(lb_to_str(text)), true];",
    "  } catch {",
    "    return [null, false];",
    "  }",
    "}",
  ],
  lb_json_stringify: [
    "function lb_json_stringify(value, pretty) {",
    "  return JSON.stringify(value === undefined ? null : value, null, pretty ? 2 : 0);",
    "}",
  ],
  lb_regex_match: [
    "// returns [matched, first match]",
    "function lb_regex_match(text, pattern, ignoreCase) {",
    "  try {",
    '    const m = new RegExp(lb_to_str(pattern), ignoreCase ? "i" : "").exec(lb_to_str(text));',
    '    return [m !== null, m ? m[0] : ""];',
    "  } catch {",
    "    // an invalid pattern is a typo mid-edit, not a graph failure",
    '    return [false, ""];',
    "  }",
    "}",
  ],
  lb_list_get: [
    "// returns [item, found]; negative indexes count back from the end",
    "function lb_list_get(list, index) {",
    "  const items = lb_to_list(list);",
    "  const raw = Math.trunc(lb_to_num(index));",
    "  const i = raw < 0 ? items.length + raw : raw;",
    "  return i >= 0 && i < items.length ? [items[i], true] : [null, false];",
    "}",
  ],
  lb_list_stats: [
    "function lb_list_stats(list, op) {",
    "  const items = lb_to_list(list);",
    '  if (op === "count") return items.length;',
    "  const nums = items.map((v) => Number(v)).filter((v) => Number.isFinite(v));",
    "  if (nums.length === 0) return 0;",
    "  const sum = nums.reduce((acc, v) => acc + v, 0);",
    '  if (op === "avg") return sum / nums.length;',
    '  if (op === "min") return Math.min(...nums);',
    '  if (op === "max") return Math.max(...nums);',
    "  return sum;",
    "}",
  ],
  lb_list_sort: [
    "function lb_list_sort(list, numeric, desc) {",
    "  const items = [...lb_to_list(list)];",
    "  items.sort((x, y) => (numeric ? lb_to_num(x) - lb_to_num(y) : lb_to_str(x).localeCompare(lb_to_str(y))));",
    "  if (desc) items.reverse();",
    "  return items;",
    "}",
  ],
  lb_list_slice: [
    "function lb_list_slice(list, start, end) {",
    "  return lb_to_list(list).slice(Math.trunc(lb_to_num(start)), Math.trunc(lb_to_num(end)));",
    "}",
  ],
  lb_list_contains: [
    "// returns [contains, index]; compared as text so 5 matches \"5\"",
    "function lb_list_contains(list, value) {",
    "  const needle = lb_to_str(value);",
    "  const i = lb_to_list(list).findIndex((v) => lb_to_str(v) === needle);",
    "  return [i !== -1, i];",
    "}",
  ],
};

const PY_HELPERS: Record<RuntimeHelper, string[]> = {
  lb_to_str: [
    "def lb_to_str(v):",
    "    # mirrors JS stringification: true/false, 5 not 5.0, JSON for containers",
    "    if v is None:",
    '        return ""',
    "    if isinstance(v, bool):",
    '        return "true" if v else "false"',
    "    if isinstance(v, (list, dict)):",
    '        return json.dumps(v, separators=(",", ":"))',
    "    if isinstance(v, float) and v.is_integer():",
    "        return str(int(v))",
    "    return str(v)",
  ],
  lb_to_num: [
    "def lb_to_num(v):",
    "    if isinstance(v, bool):",
    "        return 1.0 if v else 0.0",
    "    try:",
    "        n = float(v)",
    "    except (TypeError, ValueError):",
    "        return 0.0",
    '    if n != n or n in (float("inf"), float("-inf")):',
    "        return 0.0",
    "    return n",
  ],
  lb_to_bool: [
    "def lb_to_bool(v):",
    "    if not isinstance(v, str):",
    "        return bool(v)",
    '    return v.strip().lower() not in ("", "false", "0", "no")',
  ],
  lb_to_list: [
    "def lb_to_list(v):",
    "    if isinstance(v, list):",
    "        return v",
    '    if v is None or v == "":',
    "        return []",
    '    if isinstance(v, str) and v.strip().startswith("["):',
    "        try:",
    "            parsed = json.loads(v)",
    "            if isinstance(parsed, list):",
    "                return parsed",
    "        except ValueError:",
    "            pass  # not JSON after all — treat it as a single item",
    "    return [v]",
  ],
  lb_loose_eq: [
    "def lb_loose_eq(a, b):",
    '    # numeric-looking text compares as a number, so "5" matches 5',
    "    def coerce(v):",
    '        if isinstance(v, str) and v.strip() != "":',
    "            try:",
    "                return float(v)",
    "            except ValueError:",
    "                return v",
    "        return v",
    "    return coerce(a) == coerce(b)",
  ],
  lb_split: [
    "def lb_split(text, delim):",
    "    s = lb_to_str(text)",
    "    d = lb_to_str(delim)",
    '    return list(s) if d == "" else s.split(d)',
  ],
  lb_join: [
    "def lb_join(items, delim):",
    "    return lb_to_str(delim).join(lb_to_str(v) for v in lb_to_list(items))",
  ],
  lb_substring: [
    "def lb_substring(text, start, length):",
    "    s = lb_to_str(text)",
    "    raw = int(lb_to_num(start))",
    "    frm = max(0, len(s) + raw) if raw < 0 else raw",
    "    n = max(0, int(lb_to_num(length)))",
    "    return s[frm:frm + n]",
  ],
  lb_json_parse: [
    "def lb_json_parse(text):",
    "    # returns [parsed value, valid]",
    "    try:",
    "        return [json.loads(lb_to_str(text)), True]",
    "    except ValueError:",
    "        return [None, False]",
  ],
  lb_json_stringify: [
    "def lb_json_stringify(value, pretty):",
    "    if pretty:",
    "        return json.dumps(value, indent=2)",
    '    return json.dumps(value, separators=(",", ":"))',
  ],
  lb_regex_match: [
    "def lb_regex_match(text, pattern, ignore_case):",
    "    # returns [matched, first match]",
    "    try:",
    "        m = re.search(lb_to_str(pattern), lb_to_str(text), re.IGNORECASE if ignore_case else 0)",
    "    except re.error:",
    "        # an invalid pattern is a typo mid-edit, not a graph failure",
    '        return [False, ""]',
    '    return [m is not None, m.group(0) if m else ""]',
  ],
  lb_list_get: [
    "def lb_list_get(items, index):",
    "    # returns [item, found]; negative indexes count back from the end",
    "    values = lb_to_list(items)",
    "    raw = int(lb_to_num(index))",
    "    i = len(values) + raw if raw < 0 else raw",
    "    return [values[i], True] if 0 <= i < len(values) else [None, False]",
  ],
  lb_list_stats: [
    "def lb_list_stats(items, op):",
    "    values = lb_to_list(items)",
    '    if op == "count":',
    "        return len(values)",
    "    nums = []",
    "    for v in values:",
    "        if isinstance(v, bool) or v is None:",
    "            continue",
    "        try:",
    "            nums.append(float(v))",
    "        except (TypeError, ValueError):",
    "            continue",
    "    if not nums:",
    "        return 0",
    '    if op == "avg":',
    "        return sum(nums) / len(nums)",
    '    if op == "min":',
    "        return min(nums)",
    '    if op == "max":',
    "        return max(nums)",
    "    return sum(nums)",
  ],
  lb_list_sort: [
    "def lb_list_sort(items, numeric, desc):",
    "    values = list(lb_to_list(items))",
    "    values.sort(key=lb_to_num if numeric else lb_to_str)",
    "    if desc:",
    "        values.reverse()",
    "    return values",
  ],
  lb_list_slice: [
    "def lb_list_slice(items, start, end):",
    "    # Python slicing already matches JS Array.slice for negative indexes",
    "    return lb_to_list(items)[int(lb_to_num(start)):int(lb_to_num(end))]",
  ],
  lb_list_contains: [
    "def lb_list_contains(items, value):",
    '    # returns [contains, index]; compared as text so 5 matches "5"',
    "    values = lb_to_list(items)",
    "    needle = lb_to_str(value)",
    "    i = next((k for k, v in enumerate(values) if lb_to_str(v) == needle), -1)",
    "    return [i != -1, i]",
  ],
};

/** Source lines of one helper in the given language (used by LanguageProfile). */
export function helperSource(language: LanguageProfile["id"], name: RuntimeHelper): string[] {
  return (language === "python" ? PY_HELPERS : JS_HELPERS)[name];
}

// Structural ctx type: avoids importing EmitCtx from expressions.ts, which
// would close an import cycle (expressions -> runtime-helpers -> expressions).
interface HelperCtx {
  profile: LanguageProfile;
  setup: Map<string, string[]>;
}

/**
 * Declares a helper (and everything it calls) in the program's setup section
 * and returns its callable name. Setup blocks are content-keyed, so declaring
 * the same helper from ten nodes still emits it once.
 */
export function requireHelper(ctx: HelperCtx, name: RuntimeHelper): string {
  for (const dep of HELPER_DEPS[name]) requireHelper(ctx, dep);
  const lines = ctx.profile.helper(name);
  ctx.setup.set(lines.join("\n"), lines);
  return name;
}
