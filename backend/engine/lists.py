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
}

# Enabled-bypass primary ports; merged into helpers.BYPASS_PORTS.
LIST_BYPASS_PORTS = {
    "listLengthNode": ("list", "length"),
    "listGetNode": ("list", "item"),
    "listStatsNode": ("list", "out"),
    "listSortNode": ("list", "out"),
    "listSliceNode": ("list", "out"),
    "listContainsNode": ("list", "out"),
}
