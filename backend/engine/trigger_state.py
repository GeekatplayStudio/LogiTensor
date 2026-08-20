"""Trigger-driven state transitions for the stateful nodes.

Python mirror of `handleTriggerOperation` (src/lib/execution-helpers.ts) and
`EXTRA_TRIGGER_OPS` (src/lib/extra-trigger-ops.ts): which trigger port fired
decides how the node's stored state (kept in `data.config`) changes, and which
trigger output the chain continues from.

The backend can apply these because `run_trigger_chain` walks the edges itself
and therefore knows the `targetHandle` that fired. A node executed without a
firing port (an undriven entry point) only reflects its stored state — nothing
triggered it, so nothing may mutate.
"""

from typing import Any, Dict, Optional, Tuple

from backend.engine.values import to_bool, to_list, to_num
from backend.engine.device import DEVICE_TRIGGER_TYPES, device_trigger_ops

SEQUENCE_PORTS = ("out1", "out2", "out3")


class _DefaultPorts:
    """Sentinel: this node does not pick a continuation port itself, so the
    chain follows every trigger output wired to it (the normal case)."""

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return "DEFAULT_PORTS"


DEFAULT_PORTS = _DefaultPorts()

# Nodes whose behaviour depends on WHICH trigger port fired: they either mutate
# stored config, choose a continuation port, or both.
TRIGGER_STATE_TYPES = {
    "counterNode",
    "rangeNode",
    "toggleNode",
    "latchNode",
    "listAppendNode",
    "valueListNode",
    "gateNode",
    "onceNode",
    "sequenceNode",
    *DEVICE_TRIGGER_TYPES,
}

# Of those, the ones that must not mutate unless a trigger port actually fired.
# Device Lab nodes are actions (scan/connect/send) — same rule applies.
_STATEFUL_TYPES = TRIGGER_STATE_TYPES - {"gateNode"}

TriggerResult = Tuple[Optional[Dict[str, Any]], Any]


def _counter(inputs, config, port) -> TriggerResult:
    if port == "resetTrigger":
        count = 0
    else:
        change = 1 if port == "incTrigger" else (-1 if port == "decTrigger" else 0)
        count = int(to_num(config.get("count", 0))) + change
    return {**config, "count": count}, DEFAULT_PORTS


def _range(inputs, config, port) -> TriggerResult:
    if port == "resetTrigger":
        return {**config, "count": int(to_num(config.get("initialCount", 0)))}, DEFAULT_PORTS
    value = to_num(inputs.get("value"))
    min_val = to_num(config.get("min", 0))
    max_val = to_num(config.get("max", 0))
    current = int(to_num(config.get("count", config.get("initialCount", 0))))
    in_range = min_val <= value <= max_val
    return {**config, "count": current + 1 if in_range else current - 1}, DEFAULT_PORTS


def _toggle(inputs, config, port) -> TriggerResult:
    state = False if port == "resetTrigger" else not bool(config.get("state"))
    return {**config, "state": state}, DEFAULT_PORTS


def _latch(inputs, config, port) -> TriggerResult:
    # Anything other than Reset is a Set — the latch only has two commands.
    if port not in ("setTrigger", "resetTrigger"):
        return None, DEFAULT_PORTS
    return {**config, "state": port == "setTrigger"}, DEFAULT_PORTS


def _list_append(inputs, config, port) -> TriggerResult:
    items = [] if port == "resetTrigger" else [*to_list(config.get("items")), inputs.get("value")]
    return {**config, "items": items}, DEFAULT_PORTS


def _value_list(inputs, config, port) -> TriggerResult:
    # Value List ships without a Reset port, but a Reset clears it if one is
    # ever wired — the same rule List Append uses.
    values = [] if port == "resetTrigger" else [*to_list(config.get("values")), inputs.get("value")]
    return {**config, "values": values}, DEFAULT_PORTS


def _gate(inputs, config, port) -> TriggerResult:
    return None, ("outTrigger",) if to_bool(inputs.get("open")) else ()


def _once(inputs, config, port) -> TriggerResult:
    if port == "resetTrigger":
        return {**config, "fired": False}, ()
    if config.get("fired"):
        return None, ()
    return {**config, "fired": True}, ("outTrigger",)


def _sequence(inputs, config, port) -> TriggerResult:
    if port == "resetTrigger":
        return {**config, "step": 0}, ()
    step = max(0, int(to_num(config.get("step", 0))))
    return (
        {**config, "step": (step + 1) % len(SEQUENCE_PORTS)},
        (SEQUENCE_PORTS[step % len(SEQUENCE_PORTS)],),
    )


_OPS = {
    "counterNode": _counter,
    "rangeNode": _range,
    "toggleNode": _toggle,
    "latchNode": _latch,
    "listAppendNode": _list_append,
    "valueListNode": _value_list,
    "gateNode": _gate,
    "onceNode": _once,
    "sequenceNode": _sequence,
    # Device Lab ops live in backend/engine/device.py (500-line guardrail);
    # they take the DEFAULT_PORTS sentinel to avoid a circular import.
    **device_trigger_ops(DEFAULT_PORTS),
}


def apply_trigger_state(
    node_type: str,
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    fired_port: Optional[str],
) -> TriggerResult:
    """Returns `(updated_config_or_None, next_ports)` for `node_type`.

    `next_ports` is either `DEFAULT_PORTS` (follow every wired trigger output)
    or an explicit sequence of source handles — empty meaning "stop here".
    """
    op = _OPS.get(node_type)
    if op is None:
        return None, DEFAULT_PORTS
    if fired_port is None and node_type in _STATEFUL_TYPES:
        # Nothing fired it (an undriven entry point): reflect, never mutate.
        return None, DEFAULT_PORTS
    return op(inputs, config, fired_port or "")


def reflect_state_outputs(
    node_type: str,
    inputs: Dict[str, Any],
    config: Dict[str, Any],
    compute,
) -> Dict[str, Any]:
    """Data outputs republished from the (possibly just-mutated) config, so
    downstream data consumers and the returned `outputs` map agree."""
    if node_type == "counterNode":
        return {"count": int(to_num(config.get("count", 0)))}
    if node_type == "rangeNode":
        value = to_num(inputs.get("value"))
        min_val = to_num(config.get("min", 0))
        max_val = to_num(config.get("max", 0))
        return {
            "above": value > max_val,
            "below": value < min_val,
            "inRange": min_val <= value <= max_val,
            "count": int(to_num(config.get("count", config.get("initialCount", 0)))),
        }
    return compute(node_type, inputs, config)


def resolve_trigger_fire(raw_value: Any) -> bool:
    """Mirror of resolveTriggerFire (src/lib/trigger-bridge.ts): reads a DATA
    value arriving on a trigger port as on/off — booleans as-is, numbers above
    0 are on, null is off, anything else falls back to truthiness."""
    if isinstance(raw_value, bool):
        return raw_value
    if raw_value is None:
        return False
    try:
        n = float(raw_value)
    except (TypeError, ValueError):
        return bool(raw_value)
    if n != n:  # NaN — not a number after all
        return bool(raw_value)
    return n > 0
