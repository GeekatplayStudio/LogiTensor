"""Shared value coercions for the extended node library.

Mirrors src/lib/node-value-utils.ts — keep the two in step, the parity suite
(backend/tests/test_passive_parity.py) checks that they agree.
"""

import json
from typing import Any, List


def to_list(value: Any) -> List[Any]:
    """Coerces any port value into a list. JSON array text is parsed so a
    stringified list arriving from a script node still behaves like a list;
    anything else becomes a single-element list."""
    if isinstance(value, list):
        return value
    if value is None or value == "":
        return []
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed.startswith("["):
            try:
                parsed = json.loads(trimmed)
                if isinstance(parsed, list):
                    return parsed
            except ValueError:
                pass  # Not JSON after all — treat it as a single item.
    return [value]


def to_num(value: Any, fallback: float = 0) -> float:
    """Number conversion that never fails — mirrors the TS toNum, which
    substitutes 0 for anything that isn't a finite number."""
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        n = float(value)
    except (TypeError, ValueError):
        return float(fallback)
    if n != n or n in (float("inf"), float("-inf")):  # NaN / Infinity
        return float(fallback)
    return n


def to_str(value: Any) -> str:
    """String conversion matching JS semantics: lists/objects render as JSON,
    booleans as true/false, whole floats without a trailing .0, None as ''."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, dict)):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def to_bool(value: Any) -> bool:
    """Truthiness that understands text: 'false', 'no', '0' and '' read as
    false, so a boolean typed into a string port behaves as written."""
    if not isinstance(value, str):
        return bool(value)
    return value.strip().lower() not in ("", "false", "0", "no")
