"""Pure computations for the Lists category.

Python mirror of src/lib/list-node-compute.ts.
"""

from typing import Any, Dict, List

from backend.engine.values import to_list, to_num, to_str


def _numbers_of(items: List[Any]) -> List[float]:
    """Numeric view of a list, skipping entries that aren't numbers at all —
    mirrors how Max Selector already ignores non-numeric inputs."""
    nums = []
    for v in items:
        if isinstance(v, bool) or v is None:
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if n == n:
            nums.append(n)
    return nums


def _group_key(value: Any, case_sensitive: bool) -> str:
    """Grouping key for an entry: the same stringification the rest of the
    library uses (to_str / lb_to_str), optionally case-folded, so numbers and
    booleans group as sensibly as words do."""
    s = to_str(value)
    return s if case_sensitive else s.lower()


def _tally(items: List[Any], case_sensitive: bool) -> List[Dict[str, Any]]:
    """Ordered tallies of a list, most-frequent first.

    Ties are broken by first appearance so the result is deterministic and
    identical in both engines — relying on the language's sort stability would
    be a silent parity hazard, so the sort key says it explicitly.
    """
    by_key: Dict[str, Dict[str, Any]] = {}
    for index, value in enumerate(items):
        key = _group_key(value, case_sensitive)
        seen = by_key.get(key)
        if seen is None:
            by_key[key] = {"value": value, "count": 1, "firstIndex": index}
        else:
            seen["count"] += 1
    return sorted(by_key.values(), key=lambda t: (-t["count"], t["firstIndex"]))


def _list_frequency(inputs, config) -> Dict[str, Any]:
    case_sensitive = bool(config.get("caseSensitive", False))
    all_tallies = _tally(to_list(inputs.get("list")), case_sensitive)
    min_count = int(to_num(config.get("minCount", 1), 1))
    kept = [t for t in all_tallies if t["count"] >= min_count]
    top_n = int(to_num(config.get("topN", 0)))
    if top_n > 0:
        kept = kept[:top_n]
    return {
        "values": [t["value"] for t in kept],
        "counts": [t["count"] for t in kept],
        "report": "\n".join(f"{to_str(t['value'])}: {t['count']}" for t in kept),
        # Distinct entries in the whole input — deliberately not the filtered
        # length, so "top 5 of 300 unique words" is still expressible.
        "unique": len(all_tallies),
    }


def _list_unique(inputs, config) -> Dict[str, Any]:
    tallies = _tally(to_list(inputs.get("list")), bool(config.get("caseSensitive", False)))
    # Re-sorted to first-seen order: dedupe preserves position, it doesn't rank.
    out = [t["value"] for t in sorted(tallies, key=lambda t: t["firstIndex"])]
    return {"out": out, "count": len(out)}


def _list_count_item(inputs, config) -> Dict[str, Any]:
    case_sensitive = bool(config.get("caseSensitive", False))
    needle = _group_key(inputs.get("item"), case_sensitive)
    # Compared as text so a wired number 5 matches a typed "5", like List Contains.
    items = to_list(inputs.get("list"))
    return {"count": sum(1 for v in items if _group_key(v, case_sensitive) == needle)}


def _list_append(_inputs, config) -> Dict[str, Any]:
    # Stateful: the appended items live in config (frontend-owned); this pure
    # pass just republishes them.
    items = to_list(config.get("items"))
    return {"list": items, "length": len(items)}


def _list_get(inputs, _config) -> Dict[str, Any]:
    items = to_list(inputs.get("list"))
    raw = int(to_num(inputs.get("index")))
    # Negative indexes address from the end.
    idx = len(items) + raw if raw < 0 else raw
    found = 0 <= idx < len(items)
    return {"item": items[idx] if found else None, "found": found}


def _list_stats(inputs, config) -> Dict[str, Any]:
    items = to_list(inputs.get("list"))
    op = config.get("op", "sum")
    if op == "count":
        return {"out": len(items)}
    nums = _numbers_of(items)
    if not nums:
        return {"out": 0}
    if op == "avg":
        return {"out": sum(nums) / len(nums)}
    if op == "min":
        return {"out": min(nums)}
    if op == "max":
        return {"out": max(nums)}
    return {"out": sum(nums)}


def _list_sort(inputs, config) -> Dict[str, Any]:
    items = list(to_list(inputs.get("list")))
    numeric = config.get("numeric", True)
    items.sort(key=to_num if numeric else to_str)
    if config.get("direction", "asc") == "desc":
        items.reverse()
    return {"out": items}


def _list_slice(inputs, _config) -> Dict[str, Any]:
    items = to_list(inputs.get("list"))
    # Python slicing already matches JS Array.slice for negative indexes.
    return {"out": items[int(to_num(inputs.get("start"))):int(to_num(inputs.get("end")))]}


def _list_contains(inputs, _config) -> Dict[str, Any]:
    items = to_list(inputs.get("list"))
    needle = to_str(inputs.get("value"))
    # Compared as text so a wired number 5 matches a typed "5".
    index = next((i for i, v in enumerate(items) if to_str(v) == needle), -1)
    return {"out": index != -1, "index": index}


LIST_COMPUTE = {
    "listAppendNode": _list_append,
    "listLengthNode": lambda inputs, _config: {"length": len(to_list(inputs.get("list")))},
    "listGetNode": _list_get,
    "listStatsNode": _list_stats,
    "listSortNode": _list_sort,
    "listSliceNode": _list_slice,
    "listContainsNode": _list_contains,
    "listFrequencyNode": _list_frequency,
    "listUniqueNode": _list_unique,
    "listCountItemNode": _list_count_item,
}

# Enabled-bypass primary ports; merged into helpers.BYPASS_PORTS.
LIST_BYPASS_PORTS = {
    "listLengthNode": ("list", "length"),
    "listGetNode": ("list", "item"),
    "listStatsNode": ("list", "out"),
    "listSortNode": ("list", "out"),
    "listSliceNode": ("list", "out"),
    "listContainsNode": ("list", "out"),
    "listFrequencyNode": ("list", "values"),
    "listUniqueNode": ("list", "out"),
    "listCountItemNode": ("list", "count"),
}
