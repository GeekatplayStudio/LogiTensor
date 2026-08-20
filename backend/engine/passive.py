from typing import Dict, Any

from backend.safe_evaluator import safe_evaluate
from backend.engine.state import GraphState
from backend.engine.helpers import _coerce_operand, BYPASS_PORTS
# The extended node library registers its computations here rather than as
# more elif branches, keeping this module under the 500-line guardrail.
from backend.engine.extra import EXTRA_COMPUTE
from backend.engine.lists import LIST_COMPUTE
from backend.engine.device import DEVICE_COMPUTE
from backend.engine.nn_math import (
    _generate_weights,
    _conv1d_forward,
    _to_number_vector,
)


def evaluate_passive_node(node_id: str, state: GraphState) -> Dict[str, Any]:
    """
    Recursively evaluates passive data nodes on demand.
    Caches the outputs in state["outputs"] to avoid duplicate evaluation.
    """
    if node_id in state["outputs"]:
        return state["outputs"][node_id]

    node = state["nodes"].get(node_id)
    if not node:
        return {}

    node_type = node.get("type", "")
    config = node.get("data", {}).get("config", {})

    # Recursively resolve inputs for this passive node
    inputs = {}
    for input_port in node.get("data", {}).get("inputs", []):
        if input_port.get("type") == "trigger":
            continue

        incoming_edge = None
        for edge in state["edges"]:
            if edge.get("target") == node_id and edge.get("targetHandle") == input_port.get("id"):
                incoming_edge = edge
                break

        if incoming_edge:
            source_id = incoming_edge.get("source")
            source_handle = incoming_edge.get("sourceHandle")

            # Recurse
            source_outputs = evaluate_passive_node(source_id, state)
            inputs[input_port["id"]] = source_outputs.get(source_handle, input_port.get("value"))
        else:
            inputs[input_port["id"]] = input_port.get("value")

    # Compute the logic
    outputs = execute_logic_computation(node_type, inputs, config)
    state["outputs"][node_id] = outputs
    return outputs

def resolve_inputs(node_id: str, state: GraphState) -> Dict[str, Any]:
    """
    Scans the visual connections and resolves all incoming data values
    for a given node. Falls back to static values if not connected.
    """
    node = state["nodes"].get(node_id)
    if not node:
        return {}
    inputs = {}

    for input_port in node.get("data", {}).get("inputs", []):
        if input_port.get("type") == "trigger":
            continue

        # Find incoming data edges targeting this input port
        incoming_edge = None
        for edge in state["edges"]:
            if edge.get("target") == node_id and edge.get("targetHandle") == input_port.get("id"):
                incoming_edge = edge
                break

        if incoming_edge:
            source_id = incoming_edge.get("source")
            source_handle = incoming_edge.get("sourceHandle")

            # Resolve data node on-demand (lazy evaluation)
            source_outputs = evaluate_passive_node(source_id, state)
            inputs[input_port["id"]] = source_outputs.get(source_handle, input_port.get("value"))
        else:
            inputs[input_port["id"]] = input_port.get("value")

    return inputs


def execute_logic_computation(node_type: str, inputs: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Processes core logic and math operations.
    """
    bypass = BYPASS_PORTS.get(node_type)
    if bypass and inputs.get("enabled") is False:
        primary_in, primary_out = bypass
        return {primary_out: inputs.get(primary_in)}

    registered = EXTRA_COMPUTE.get(node_type) or LIST_COMPUTE.get(node_type) or DEVICE_COMPUTE.get(node_type)
    if registered:
        return registered(inputs, config)

    outputs = {}
    if node_type == "constNum":
        outputs["value"] = float(config.get("value", 0))
    elif node_type == "constBool":
        outputs["value"] = bool(config.get("value", True))
    elif node_type == "constString":
        outputs["value"] = str(config.get("value", ""))
    elif node_type == "andGate":
        outputs["out"] = bool(inputs.get("a") and inputs.get("b"))
    elif node_type == "orGate":
        outputs["out"] = bool(inputs.get("a") or inputs.get("b"))
    elif node_type == "notGate":
        outputs["out"] = not bool(inputs.get("a"))
    elif node_type == "xorGate":
        outputs["out"] = bool(inputs.get("a")) != bool(inputs.get("b"))
    elif node_type == "norGate":
        outputs["out"] = not (bool(inputs.get("a")) or bool(inputs.get("b")))
    elif node_type == "nandGate":
        outputs["out"] = not (bool(inputs.get("a")) and bool(inputs.get("b")))
    elif node_type == "condValue":
        outputs["out"] = inputs.get("trueVal") if inputs.get("condition") else inputs.get("falseVal")
    elif node_type == "compareNode":
        op = config.get("op", "==")
        a = inputs.get("a")
        b = inputs.get("b")
        res = False
        try:
            val_a = float(a) if isinstance(a, (int, float, str)) and str(a).replace(".", "", 1).isdigit() else a
            val_b = float(b) if isinstance(b, (int, float, str)) and str(b).replace(".", "", 1).isdigit() else b
            if op == "==": res = val_a == val_b
            elif op == "!=": res = val_a != val_b
            elif op == ">": res = val_a > val_b
            elif op == ">=": res = val_a >= val_b
            elif op == "<": res = val_a < val_b
            elif op == "<=": res = val_a <= val_b
        except Exception:
            res = False
        outputs["out"] = res
    elif node_type == "expressionNode":
        expr = config.get("expression", "x * 2 + y")
        # Ports display as X/Y on the node but are named x/y — accept either case.
        expr_ctx = {}
        for k, v in inputs.items():
            expr_ctx[k] = v
            expr_ctx[k.upper()] = v
        outputs["out"] = safe_evaluate(expr, expr_ctx)
    elif node_type == "mathNode":
        expr = config.get("expression", "a + b")
        # Ports are named a/b/c… but display as A/B/C on the node — accept
        # either case in the formula so typing what you see on the node works.
        ctx = {}
        for k, v in inputs.items():
            coerced = _coerce_operand(v)
            ctx[k] = coerced
            ctx[k.upper()] = coerced
        try:
            outputs["out"] = safe_evaluate(expr, ctx)
        except TypeError:
            # Mixed string/number operands: fall back to string semantics
            str_ctx = {}
            for k, v in inputs.items():
                s = "" if v is None else str(v)
                str_ctx[k] = s
                str_ctx[k.upper()] = s
            outputs["out"] = safe_evaluate(expr, str_ctx)
    elif node_type == "mathFunctionNode":
        import math
        try:
            a = float(inputs.get("a", 0) or 0)
            b = float(inputs.get("b", 0) or 0)
        except (TypeError, ValueError):
            a, b = 0.0, 0.0
        op = config.get("op", "abs")
        fns = {
            "abs": lambda: abs(a),
            "round": lambda: round(a),
            "floor": lambda: math.floor(a),
            "ceil": lambda: math.ceil(a),
            "sqrt": lambda: math.sqrt(a) if a >= 0 else 0,
            "pow": lambda: a ** b,
            "min": lambda: min(a, b),
            "max": lambda: max(a, b),
            "mod": lambda: (a % b) if b != 0 else 0,
        }
        outputs["out"] = fns.get(op, fns["abs"])()
    elif node_type == "filterNode":
        val = inputs.get("value")
        search = str(inputs.get("search", "") or "")
        hay = str(val if val is not None else "")
        if config.get("caseSensitive"):
            found = search in hay
        else:
            found = search.lower() in hay.lower()
        passed = found if config.get("mode", "include") == "include" else not found
        outputs["match"] = passed
        outputs["out"] = val if passed else None
    elif node_type == "stringOpNode":
        text = str(inputs.get("text", "") or "")
        op = config.get("op", "uppercase")
        if op == "uppercase":
            outputs["out"] = text.upper()
        elif op == "lowercase":
            outputs["out"] = text.lower()
        elif op == "trim":
            outputs["out"] = text.strip()
        elif op == "length":
            outputs["out"] = len(text)
        elif op == "reverse":
            outputs["out"] = text[::-1]
        else:
            outputs["out"] = text
    elif node_type == "replaceTextNode":
        text = str(inputs.get("text", "") or "")
        find = str(inputs.get("find", "") or "")
        replace = str(inputs.get("replace", "") or "")
        outputs["out"] = text if find == "" else text.replace(find, replace)
    elif node_type == "forLoopNode":
        outputs["index"] = int(config.get("index", 0) or 0)
    elif node_type == "whileLoopNode":
        outputs["iteration"] = int(config.get("iteration", 0) or 0)
    elif node_type == "randomNode":
        import random
        try:
            min_val = int(inputs.get("min", 0))
            max_val = int(inputs.get("max", 100))
            low = min(min_val, max_val)
            high = max(min_val, max_val)
            outputs["value"] = random.randint(low, high)
        except Exception:
            outputs["value"] = 0
    elif node_type == "thresholdNeuron":
        value = float(inputs.get("value", 0) or 0)
        threshold = float(inputs.get("threshold", 0) or 0)
        mode = config.get("mode", "above")
        fired = value < threshold if mode == "below" else value > threshold
        outputs["fired"] = fired
        outputs["out"] = value if fired else None
    elif node_type == "rangeNode":
        value = float(inputs.get("value", 0) or 0)
        min_val = float(config.get("min", 0) or 0)
        max_val = float(config.get("max", 0) or 0)
        outputs["above"] = value > max_val
        outputs["below"] = value < min_val
        outputs["inRange"] = not outputs["above"] and not outputs["below"]
        outputs["count"] = int(config.get("count", config.get("initialCount", 0)) or 0)
    elif node_type == "assertNode":
        # Mirrors the TS assertNode: loose equality with numeric coercion so
        # "5" (typed expectation) passes against a wired 5.
        a = _coerce_operand(inputs.get("value"))
        b = _coerce_operand(inputs.get("expected"))
        outputs["pass"] = a == b
    elif node_type == "maxSelectorNode":
        vals = []
        for v in inputs.values():
            try:
                vals.append(float(v))
            except (TypeError, ValueError):
                continue
        outputs["out"] = max(vals) if vals else 0
    elif node_type == "synapseNode":
        weight = float(config.get("weight", 1) or 0)
        signal = float(inputs.get("in", 0) or 0) * weight
        outputs["out"] = -abs(signal) if config.get("inhibitory") else signal
    elif node_type == "leakyIntegrateFire":
        outputs["potential"] = float(config.get("potential", 0) or 0)
    elif node_type == "imageInputGrid":
        cell_values = config.get("cellValues", [])
        outputs["values"] = list(cell_values) if isinstance(cell_values, list) else []
    elif node_type == "denseLayer":
        import math
        xs = _to_number_vector(inputs.get("in"))
        try:
            neurons = max(1, min(64, int(float(config.get("neurons", 8) or 1))))
        except (TypeError, ValueError):
            neurons = 8
        try:
            seed = int(float(config.get("seed", 42) or 0))
        except (TypeError, ValueError):
            seed = 42
        activation = config.get("activation", "sigmoid")
        weights = _generate_weights(seed, len(xs), neurons)
        # Normalize by sqrt(inputs) so activations stay in a useful range no
        # matter the grid size feeding the layer (mirrors the TS side).
        norm = max(1.0, math.sqrt(len(xs)))
        out = []
        for row in weights:
            z = sum(w * x for w, x in zip(row, xs)) / norm
            z = max(-60.0, min(60.0, z))
            if activation == "relu":
                out.append(max(0.0, z))
            elif activation == "tanh":
                out.append(math.tanh(z))
            else:
                out.append(1.0 / (1.0 + math.exp(-z)))
        outputs["out"] = out
    elif node_type == "conv1dLayer":
        xs = _to_number_vector(inputs.get("in"))
        try:
            filters = max(1, min(32, int(float(config.get("filters", 4) or 1))))
        except (TypeError, ValueError):
            filters = 4
        try:
            kernel_size = max(1, min(16, int(float(config.get("kernelSize", 3) or 1))))
        except (TypeError, ValueError):
            kernel_size = 3
        try:
            stride = max(1, int(float(config.get("stride", 1) or 1)))
        except (TypeError, ValueError):
            stride = 1
        try:
            seed = int(float(config.get("seed", 42) or 0))
        except (TypeError, ValueError):
            seed = 42
        activation = config.get("activation", "relu")
        outputs["out"] = _conv1d_forward(xs, seed, kernel_size, filters, stride, activation)
    elif node_type == "outputLayerNode":
        xs = _to_number_vector(inputs.get("in"))
        outputs["out"] = xs
        winner = -1
        for i, v in enumerate(xs):
            if winner == -1 or v > xs[winner]:
                winner = i
        outputs["winner"] = winner
    return outputs
