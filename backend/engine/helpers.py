from backend.safe_evaluator import safe_evaluate
from backend.engine.state import ACTIVE_TYPES
from backend.engine.extra import EXTRA_BYPASS_PORTS
from backend.engine.lists import LIST_BYPASS_PORTS


def _is_trigger_handle(handle) -> bool:
    """Name-based guess at whether a handle is a trigger port. Only a fallback
    for edges whose endpoints don't declare the port (hand-written graphs and
    older saves) — prefer the declaration-based helpers below."""
    return bool(handle) and (
        str(handle).endswith("Trigger")
        # out1/out2/out3 are the Sequence node's ordered trigger outputs.
        or handle in ("triggerOut", "outTrigger", "onTrue", "onFalse", "done", "loopBody", "spike", "out1", "out2", "out3")
    )


def _port_kind(node, port_key: str, handle):
    """The declared type ('trigger' / 'data') of a port on `node`, or None when
    the node doesn't declare it."""
    if not node:
        return None
    for port in (node.get("data", {}).get(port_key) or []):
        if port.get("id") == handle:
            return port.get("type")
    return None


def _is_trigger_edge(edge, nodes) -> bool:
    """An edge is a trigger edge when its TARGET port is a trigger input.

    Classifying by the target (rather than by the source handle's name) is what
    makes the frontend's "hybrid trigger" connection visible here: a boolean or
    number DATA output may be wired straight into a trigger INPUT (see onConnect
    in src/components/node-editor/store/graph-slice.ts), and such an edge fires
    its target even though its source handle is called `value` or `above`.
    """
    kind = _port_kind(nodes.get(edge.get("target")), "inputs", edge.get("targetHandle"))
    if kind is not None:
        return kind == "trigger"
    return _is_trigger_handle(edge.get("sourceHandle"))


def _is_data_source(edge, nodes) -> bool:
    """True when the edge leaves a DATA output — i.e. if it also lands on a
    trigger input it is a hybrid data→trigger connection, not a trigger wire."""
    kind = _port_kind(nodes.get(edge.get("source")), "outputs", edge.get("sourceHandle"))
    if kind is not None:
        return kind == "data"
    return not _is_trigger_handle(edge.get("sourceHandle"))


def _coerce_operand(v):
    """Numeric-looking strings become numbers so formulas compute; other
    values pass through so string logic (concatenation, comparison) works."""
    if isinstance(v, str):
        t = v.strip()
        if t != "":
            try:
                return float(t) if ("." in t or "e" in t.lower()) else int(t)
            except ValueError:
                pass
    return v


def _condition_flag(cond_val, state) -> bool:
    """Resolves a condition value (bool, truthy strings, or a safe expression
    evaluated against all node outputs) to a boolean."""
    if not isinstance(cond_val, str):
        return bool(cond_val)
    trimmed = cond_val.strip().lower()
    if trimmed in ("true", "1", "yes"):
        return True
    if trimmed in ("false", "0", "no", ""):
        return False
    try:
        context = {}
        for source_nid, node_outs in state["outputs"].items():
            for port_id, val in node_outs.items():
                context[f"{source_nid}_{port_id}"] = val
                if len(node_outs) == 1 or port_id in ("value", "out", "result", "response"):
                    context[source_nid] = val
        return bool(safe_evaluate(cond_val, context))
    except Exception as e:
        state["logs"].append(f"Condition expression evaluation failed: {str(e)}. Defaulting to False.")
        return False


def _clear_passive_cache(state) -> None:
    """Drops cached outputs of passive (data) nodes so they re-evaluate with
    fresh loop counters on the next resolve — active node outputs persist."""
    passive_ids = [
        nid for nid in list(state["outputs"].keys())
        if state["nodes"].get(nid, {}).get("type") not in ACTIVE_TYPES
    ]
    for nid in passive_ids:
        del state["outputs"][nid]


# Mirrors BYPASS_PORTS in src/lib/execution-helpers.ts: nodes with an Enabled
# input skip their computation and pass their primary input straight to their
# primary output when Enabled is false.
BYPASS_PORTS = {
    "andGate": ("a", "out"),
    "orGate": ("a", "out"),
    "notGate": ("a", "out"),
    "xorGate": ("a", "out"),
    "norGate": ("a", "out"),
    "nandGate": ("a", "out"),
    "compareNode": ("a", "out"),
    "expressionNode": ("x", "out"),
    "mathNode": ("a", "out"),
    "mathFunctionNode": ("a", "out"),
    "filterNode": ("value", "out"),
    "stringOpNode": ("text", "out"),
    "replaceTextNode": ("text", "out"),
    "thresholdNeuron": ("value", "out"),
    "maxSelectorNode": ("a", "out"),
    "synapseNode": ("in", "out"),
    "denseLayer": ("in", "out"),
    "conv1dLayer": ("in", "out"),
    **EXTRA_BYPASS_PORTS,
    **LIST_BYPASS_PORTS,
}
