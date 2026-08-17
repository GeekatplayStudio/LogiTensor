"""Pure computations for the Inputs / Logic / Math / Data & Text / Outputs
nodes added on top of the original node library.

Python mirror of src/lib/extra-node-compute.ts.
"""

import json
import math
import re
import time
from typing import Any, Dict, List

from backend.engine.values import to_bool, to_list, to_num, to_str


def _round_to(value: float, decimals: float) -> float:
    """Rounds like JS Math.round (half up, toward +infinity) rather than
    Python's default banker's rounding, so both engines agree."""
    d = max(0, min(10, int(decimals)))
    factor = 10 ** d
    return math.floor(value * factor + 0.5) / factor


def _slider(_inputs, config) -> Dict[str, Any]:
    lo = to_num(config.get("min", 0))
    hi = to_num(config.get("max", 100))
    return {"value": min(max(to_num(config.get("value")), min(lo, hi)), max(lo, hi))}


def _current_time(_inputs, _config) -> Dict[str, Any]:
    now = time.time()
    return {
        "epoch": int(now * 1000),
        "formatted": time.strftime("%H:%M:%S", time.localtime(now)),
    }


def _clamp(inputs, _config) -> Dict[str, Any]:
    lo = min(to_num(inputs.get("min")), to_num(inputs.get("max")))
    hi = max(to_num(inputs.get("min")), to_num(inputs.get("max")))
    return {"out": min(max(to_num(inputs.get("value")), lo), hi)}


def _map_range(inputs, _config) -> Dict[str, Any]:
    in_min = to_num(inputs.get("inMin"))
    in_max = to_num(inputs.get("inMax"))
    out_min = to_num(inputs.get("outMin"))
    # A zero-width source range has no meaningful ratio — collapse to outMin.
    if in_max == in_min:
        return {"out": out_min}
    ratio = (to_num(inputs.get("value")) - in_min) / (in_max - in_min)
    return {"out": out_min + ratio * (to_num(inputs.get("outMax")) - out_min)}


def _lerp(inputs, _config) -> Dict[str, Any]:
    a = to_num(inputs.get("a"))
    return {"out": a + (to_num(inputs.get("b")) - a) * to_num(inputs.get("t"))}


def _between(inputs, config) -> Dict[str, Any]:
    value = to_num(inputs.get("value"))
    lo = min(to_num(inputs.get("min")), to_num(inputs.get("max")))
    hi = max(to_num(inputs.get("min")), to_num(inputs.get("max")))
    if config.get("inclusive", True):
        return {"out": lo <= value <= hi}
    return {"out": lo < value < hi}


def _split_by_mode(text: str, mode: str, delimiter: str) -> List[str]:
    """Split Text's three modes. `whitespace` is the natural choice for words;
    `lines` accepts CRLF, CR and LF alike. Empty text yields an empty list in
    both of those, rather than a single blank entry."""
    if mode == "whitespace":
        # str.split() with no argument already splits on runs of whitespace
        # and drops the leading/trailing empties, matching the JS /\s+/ path.
        return text.split()
    if mode == "lines":
        return [] if text == "" else re.split(r"\r\n|\r|\n", text)
    return list(text) if delimiter == "" else text.split(delimiter)


def _split_text(inputs, config) -> Dict[str, Any]:
    text = to_str(inputs.get("text"))
    delim = "" if inputs.get("delimiter") is None else str(inputs.get("delimiter"))
    # Graphs saved before the mode config existed have no key — default to the
    # original delimiter behaviour so they keep working unchanged.
    items = _split_by_mode(text, config.get("mode", "delimiter"), delim)
    return {"list": items, "count": len(items)}


def _substring(inputs, _config) -> Dict[str, Any]:
    text = to_str(inputs.get("text"))
    raw = int(to_num(inputs.get("start")))
    start = max(0, len(text) + raw) if raw < 0 else raw
    length = max(0, int(to_num(inputs.get("length"))))
    return {"out": text[start:start + length]}


def _template(inputs, config) -> Dict[str, Any]:
    out = str(config.get("template", "") or "")
    # Lettered inputs only (a, b, c…) — the Enabled bypass port is not a
    # placeholder. Both {a} and {A} are accepted, like the Formula node.
    for key, raw in inputs.items():
        if not re.fullmatch(r"[a-z]", str(key)):
            continue
        val = to_str(raw)
        out = out.replace("{" + key + "}", val).replace("{" + key.upper() + "}", val)
    return {"out": out}


def _json_parse(inputs, _config) -> Dict[str, Any]:
    try:
        return {"out": json.loads(to_str(inputs.get("text"))), "valid": True}
    except ValueError:
        return {"out": None, "valid": False}


def _json_stringify(inputs, config) -> Dict[str, Any]:
    value = inputs.get("value")
    if config.get("pretty"):
        return {"out": json.dumps(value, indent=2)}
    return {"out": json.dumps(value, separators=(",", ":"))}


def _regex_match(inputs, config) -> Dict[str, Any]:
    try:
        flags = re.IGNORECASE if config.get("ignoreCase") else 0
        m = re.search(str(inputs.get("pattern") or ""), to_str(inputs.get("text")), flags)
    except re.error:
        # An invalid pattern is a user typo mid-edit, not a graph failure.
        return {"matched": False, "match": ""}
    return {"matched": m is not None, "match": m.group(0) if m else ""}


def _gauge(inputs, config) -> Dict[str, Any]:
    lo = to_num(config.get("min", 0))
    hi = to_num(config.get("max", 100))
    if hi == lo:
        return {"percent": 0}
    pct = ((to_num(inputs.get("value")) - lo) / (hi - lo)) * 100
    return {"percent": min(100.0, max(0.0, pct))}


def _value_list(_inputs, config) -> Dict[str, Any]:
    values = to_list(config.get("values"))
    return {"list": values, "length": len(values)}


EXTRA_COMPUTE = {
    "sliderInput": _slider,
    "textAreaInput": lambda _inputs, config: {"value": str(config.get("value", "") or "")},
    "currentTimeNode": _current_time,
    "xnorGate": lambda inputs, _config: {"out": bool(inputs.get("a")) == bool(inputs.get("b"))},
    # Stateful gates: the state lives in config (mutated on a trigger fire by
    # backend/engine/trigger_state.py); the pure pass republishes it.
    "toggleNode": lambda _inputs, config: {"state": bool(config.get("state"))},
    "latchNode": lambda _inputs, config: {"state": bool(config.get("state"))},
    "clampNode": _clamp,
    "mapRangeNode": _map_range,
    "lerpNode": _lerp,
    "betweenNode": _between,
    "roundToNode": lambda inputs, config: {
        "out": _round_to(to_num(inputs.get("value")), to_num(config.get("decimals", 2), 2))
    },
    "splitTextNode": _split_text,
    "joinTextNode": lambda inputs, _config: {
        "out": ("" if inputs.get("delimiter") is None else str(inputs.get("delimiter"))).join(
            to_str(v) for v in to_list(inputs.get("list"))
        )
    },
    "substringNode": _substring,
    "templateNode": _template,
    "jsonParseNode": _json_parse,
    "jsonStringifyNode": _json_stringify,
    "toNumberNode": lambda inputs, _config: {"out": to_num(inputs.get("value"))},
    "toStringNode": lambda inputs, _config: {"out": to_str(inputs.get("value"))},
    "toBooleanNode": lambda inputs, _config: {"out": to_bool(inputs.get("value"))},
    "regexMatchNode": _regex_match,
    "valueListNode": _value_list,
    "gaugeNode": _gauge,
}

# Enabled-bypass primary ports; merged into helpers.BYPASS_PORTS.
EXTRA_BYPASS_PORTS = {
    "xnorGate": ("a", "out"),
    "clampNode": ("value", "out"),
    "mapRangeNode": ("value", "out"),
    "lerpNode": ("a", "out"),
    "betweenNode": ("value", "out"),
    "roundToNode": ("value", "out"),
    "splitTextNode": ("text", "list"),
    "joinTextNode": ("list", "out"),
    "substringNode": ("text", "out"),
    "templateNode": ("a", "out"),
    "jsonParseNode": ("text", "out"),
    "jsonStringifyNode": ("value", "out"),
    "toNumberNode": ("value", "out"),
    "toStringNode": ("value", "out"),
    "toBooleanNode": ("value", "out"),
    "regexMatchNode": ("text", "match"),
}
