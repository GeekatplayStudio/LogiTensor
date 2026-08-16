import { toList, toNum, toStr } from "./node-value-utils";

type Compute = (inputs: Record<string, any>, config: Record<string, any>) => Record<string, any>;

/** Numeric view of a list, skipping entries that aren't numbers at all —
 * mirrors how Max Selector already ignores non-numeric inputs. */
function numbersOf(list: any[]): number[] {
  return list.map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

/**
 * Pure computations for the Lists category. Registered into
 * computeNodeOutputs via LIST_COMPUTE; mirrored by backend/engine/lists.py.
 */
/** Grouping key for an entry: the same stringification the rest of the library
 * uses (toStr / lb_to_str), optionally case-folded, so numbers and booleans
 * group as sensibly as words do. */
function groupKey(value: any, caseSensitive: boolean): string {
  const s = toStr(value);
  return caseSensitive ? s : s.toLowerCase();
}

/** One tally: the first entry seen for a key (kept as the representative
 * value), how many times it occurred, and where it first appeared. */
interface Tally {
  value: any;
  count: number;
  firstIndex: number;
}

/** Ordered tallies of a list, most-frequent first.
 *
 * Ties are broken by first appearance so the result is deterministic and
 * identical in both engines — relying on the language's sort stability would
 * be a silent parity hazard, so the comparator says it explicitly.
 */
function tally(list: any[], caseSensitive: boolean): Tally[] {
  const byKey = new Map<string, Tally>();
  list.forEach((value, index) => {
    const key = groupKey(value, caseSensitive);
    const seen = byKey.get(key);
    if (seen) seen.count += 1;
    else byKey.set(key, { value, count: 1, firstIndex: index });
  });
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex);
}

export const LIST_COMPUTE: Record<string, Compute> = {
  // Stateful: the appended items live in config (frontend-owned), the pure
  // pass just republishes them so downstream data nodes stay in sync.
  listAppendNode: (_inputs, config) => {
    const items = toList(config.items);
    return { list: items, length: items.length };
  },

  listLengthNode: (inputs) => ({ length: toList(inputs.list).length }),

  listGetNode: (inputs) => {
    const list = toList(inputs.list);
    const raw = Math.trunc(toNum(inputs.index));
    // Negative indexes address from the end, like Python/JS slice semantics.
    const idx = raw < 0 ? list.length + raw : raw;
    const found = idx >= 0 && idx < list.length;
    return { item: found ? list[idx] : null, found };
  },

  listStatsNode: (inputs, config) => {
    const list = toList(inputs.list);
    const op = config.op ?? "sum";
    if (op === "count") return { out: list.length };
    const nums = numbersOf(list);
    if (nums.length === 0) return { out: 0 };
    const sum = nums.reduce((acc, v) => acc + v, 0);
    if (op === "avg") return { out: sum / nums.length };
    if (op === "min") return { out: Math.min(...nums) };
    if (op === "max") return { out: Math.max(...nums) };
    return { out: sum };
  },

  listSortNode: (inputs, config) => {
    const list = [...toList(inputs.list)];
    const numeric = config.numeric ?? true;
    list.sort((x, y) =>
      numeric
        ? toNum(x) - toNum(y)
        : toStr(x).localeCompare(toStr(y))
    );
    if ((config.direction ?? "asc") === "desc") list.reverse();
    return { out: list };
  },

  listSliceNode: (inputs) => {
    const list = toList(inputs.list);
    return { out: list.slice(Math.trunc(toNum(inputs.start)), Math.trunc(toNum(inputs.end))) };
  },

  listFrequencyNode: (inputs, config) => {
    const list = toList(inputs.list);
    const caseSensitive = config.caseSensitive ?? false;
    const all = tally(list, caseSensitive);
    const minCount = Math.trunc(toNum(config.minCount, 1));
    let kept = all.filter((t) => t.count >= minCount);
    const topN = Math.trunc(toNum(config.topN, 0));
    if (topN > 0) kept = kept.slice(0, topN);
    return {
      values: kept.map((t) => t.value),
      counts: kept.map((t) => t.count),
      report: kept.map((t) => `${toStr(t.value)}: ${t.count}`).join("\n"),
      // Distinct entries in the whole input — deliberately not the filtered
      // length, so "top 5 of 300 unique words" is still expressible.
      unique: all.length,
    };
  },

  listUniqueNode: (inputs, config) => {
    const out = tally(toList(inputs.list), config.caseSensitive ?? false)
      // Re-sorted to first-seen order: dedupe preserves position, it doesn't rank.
      .sort((a, b) => a.firstIndex - b.firstIndex)
      .map((t) => t.value);
    return { out, count: out.length };
  },

  listCountItemNode: (inputs, config) => {
    const caseSensitive = config.caseSensitive ?? false;
    const needle = groupKey(inputs.item, caseSensitive);
    // Compared as text so a wired number 5 matches a typed "5", like List Contains.
    return { count: toList(inputs.list).filter((v) => groupKey(v, caseSensitive) === needle).length };
  },

  listContainsNode: (inputs) => {
    const list = toList(inputs.list);
    const needle = toStr(inputs.value);
    // Compared as text so a wired number 5 matches a typed "5" — the same
    // tolerance the Compare and Expected Value nodes already apply.
    const index = list.findIndex((v) => toStr(v) === needle);
    return { out: index !== -1, index };
  },
};

/** Enabled-bypass primary ports for the pure list nodes. */
export const LIST_BYPASS_PORTS: Record<string, { primaryIn: string; primaryOut: string }> = {
  listLengthNode: { primaryIn: "list", primaryOut: "length" },
  listGetNode: { primaryIn: "list", primaryOut: "item" },
  listStatsNode: { primaryIn: "list", primaryOut: "out" },
  listSortNode: { primaryIn: "list", primaryOut: "out" },
  listSliceNode: { primaryIn: "list", primaryOut: "out" },
  listContainsNode: { primaryIn: "list", primaryOut: "out" },
  listFrequencyNode: { primaryIn: "list", primaryOut: "values" },
  listUniqueNode: { primaryIn: "list", primaryOut: "out" },
  listCountItemNode: { primaryIn: "list", primaryOut: "count" },
};
