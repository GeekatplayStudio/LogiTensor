import asyncio
from typing import Dict, List, Any, TypedDict, Callable
import base64
import os
import ollama
from langgraph.graph import StateGraph, END
from backend.security import validate_python_code
from backend.safe_evaluator import safe_evaluate

# Define the structure of the LangGraph state
class GraphState(TypedDict):
    nodes: Dict[str, Any]
    edges: List[Dict[str, Any]]
    outputs: Dict[str, Dict[str, Any]]
    logs: List[str]
    error: str
    active_node: str

ACTIVE_TYPES = {
    "triggerInput",
    "delayNode",
    "counterNode",
    "pythonScript",
    "ollamaLLM",
    "ollamaVLM",
    "ifElseTrigger",
    "loggerNode",
    "textOutputNode",
    "forLoopNode",
    "whileLoopNode",
    "randomNode",
    "leakyIntegrateFire",
}

LOOP_TYPES = {"forLoopNode", "whileLoopNode"}


def _is_trigger_handle(handle) -> bool:
    return bool(handle) and (
        str(handle).endswith("Trigger")
        or handle in ("triggerOut", "outTrigger", "onTrue", "onFalse", "done", "loopBody", "spike")
    )


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
}


def _mulberry32(seed: int):
    """Bit-for-bit port of mulberry32 in src/lib/execution-helpers.ts, so a
    Dense Layer's weight web is identical in the live preview and the /run
    engine. Change one and you must change both."""
    a = int(seed) & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (((t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t) & 0xFFFFFFFF
        return (t ^ (t >> 14)) / 4294967296

    return rand


def _generate_weights(seed: int, input_size: int, neurons: int):
    """weights[neuron][input] in [-1, 1) — same generation order as the TS
    generateWeights so both sides produce the same matrix."""
    rand = _mulberry32(seed)
    return [[rand() * 2 - 1 for _ in range(input_size)] for _ in range(neurons)]


def _conv1d_output_positions(input_len: int, kernel_size: int, stride: int) -> int:
    if input_len < kernel_size or kernel_size < 1 or stride < 1:
        return 0
    return (input_len - kernel_size) // stride + 1


def _conv1d_forward(values, seed, kernel_size, filters, stride, activation):
    """Bit-for-bit port of conv1dForward in src/lib/execution-helpers.ts —
    each filter's kernel slides across `values`, so every output only depends
    on a local window, not the whole input (unlike a Dense Layer)."""
    import math
    positions = _conv1d_output_positions(len(values), kernel_size, stride)
    if positions == 0:
        return []
    kernels = _generate_weights(seed, kernel_size, filters)  # kernels[f][k]
    out = []
    for f in range(filters):
        for p in range(positions):
            z = sum(kernels[f][k] * values[p * stride + k] for k in range(kernel_size))
            z = max(-60.0, min(60.0, z))
            if activation == "sigmoid":
                out.append(1.0 / (1.0 + math.exp(-z)))
            elif activation == "tanh":
                out.append(math.tanh(z))
            else:
                out.append(max(0.0, z))  # relu
    return out


def _to_number_vector(v) -> list:
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        try:
            out.append(float(x))
        except (TypeError, ValueError):
            out.append(0.0)
    return out


def execute_logic_computation(node_type: str, inputs: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Processes core logic and math operations.
    """
    bypass = BYPASS_PORTS.get(node_type)
    if bypass and inputs.get("enabled") is False:
        primary_in, primary_out = bypass
        return {primary_out: inputs.get(primary_in)}

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

async def run_node_task(node_id: str, state: GraphState) -> GraphState:
    """
    Executes a single node, resolving inputs, running computations
    or external API calls, updating outputs, and appending logs.
    """
    node = state["nodes"][node_id]
    node_type = node["type"]
    config = node["data"].get("config", {})
    inputs = resolve_inputs(node_id, state)
    
    outputs = {}
    log_msg = f"Executing node {node_id} ({node['data']['label']})"
    state["logs"].append(log_msg)
    state["active_node"] = node_id

    try:
        # 1. Custom Python execution
        if node_type == "pythonScript":
            script_code = config.get("code", "")
            # Security AST check
            validate_python_code(script_code)
            
            # Setup sandbox local scope variables
            local_scope = {"x": inputs.get("x"), "y": inputs.get("y")}
            # Execute python block
            exec(script_code, {}, local_scope)
            outputs["result"] = local_scope.get("result", None)
            state["logs"].append(f"Python script execution completed. Result: {outputs['result']}")
            
        # 2. Ollama LLM queries
        elif node_type == "ollamaLLM":
            model_tag = config.get("model", "llama3")
            prompt_str = inputs.get("prompt", "")
            sys_prompt = config.get("systemPrompt", "")
            
            state["logs"].append(f"Querying Ollama LLM model '{model_tag}'...")
            
            # Call Ollama locally using asyncio thread pool to keep backend non-blocking
            loop = asyncio.get_event_loop()
            res = await loop.run_in_executor(
                None,
                lambda: ollama.generate(model=model_tag, prompt=prompt_str, system=sys_prompt)
            )
            outputs["response"] = res.get("response", "")
            state["logs"].append("Ollama LLM responded successfully.")
            
        # 3. Ollama Vision queries (VLM)
        elif node_type == "ollamaVLM":
            model_tag = config.get("model", "llava")
            prompt_str = inputs.get("prompt", "")
            img_src = inputs.get("image", "")
            
            img_bytes_list = []
            if img_src:
                if img_src.startswith("data:image"):
                    # Extract raw base64 contents
                    base64_data = img_src.split(",")[1]
                    img_bytes_list = [base64.b64decode(base64_data)]
                elif os.path.exists(img_src):
                    with open(img_src, "rb") as f:
                        img_bytes_list = [f.read()]
                else:
                    state["logs"].append(f"Warning: Image source '{img_src}' not found.")
            
            state["logs"].append(f"Querying Ollama VLM vision model '{model_tag}'...")
            
            loop = asyncio.get_event_loop()
            res = await loop.run_in_executor(
                None,
                lambda: ollama.generate(model=model_tag, prompt=prompt_str, images=img_bytes_list)
            )
            outputs["response"] = res.get("response", "")
            state["logs"].append("Ollama VLM responded successfully.")
            
        # 4. Asynchronous delay
        elif node_type == "delayNode":
            delay_ms = int(inputs.get("delayMs", 1000))
            state["logs"].append(f"Delaying execution path by {delay_ms}ms...")
            await asyncio.sleep(delay_ms / 1000.0)
            
        # 4.5. Random generator node
        elif node_type == "randomNode":
            import random
            min_val = int(inputs.get("min", 0))
            max_val = int(inputs.get("max", 100))
            val = random.randint(min(min_val, max_val), max(min_val, max_val))
            outputs["value"] = val
            state["logs"].append(f"Generated random value: {val} (range: {min_val} to {max_val})")
            
        # 5. Incremental Counter update
        elif node_type == "counterNode":
            # Values are updated on the frontend when trigger flow hits it.
            # Here we just resolve its output count.
            outputs["count"] = int(config.get("count", 0))

        # 5.5. Leaky integrate-and-fire neuron: integrate Input into Potential
        # (decayed by Leak each step), spiking and resetting once Threshold
        # is crossed.
        elif node_type == "leakyIntegrateFire" and inputs.get("enabled") is False:
            # Bypassed: the neuron is frozen — no leak, no integration, no spike.
            outputs["potential"] = float(config.get("potential", 0) or 0)
            outputs["_spiked"] = False

        elif node_type == "leakyIntegrateFire":
            leak = min(max(float(config.get("leak", 0.2) or 0), 0.0), 1.0)
            threshold = float(config.get("threshold", 1) or 0)
            reset_value = float(config.get("resetValue", 0) or 0)
            input_val = float(inputs.get("input", 0) or 0)
            decayed = float(config.get("potential", 0) or 0) * (1 - leak)
            potential = decayed + input_val
            fired = potential >= threshold
            node["data"]["config"] = {**config, "potential": reset_value if fired else potential}
            outputs["potential"] = reset_value if fired else potential
            outputs["_spiked"] = fired
            state["logs"].append(
                f"LIF neuron {node_id}: potential={potential:.3f} "
                f"{'SPIKED' if fired else '(no spike)'}"
            )
            
        # 6. Console Log collector
        elif node_type == "loggerNode":
            val_to_log = inputs.get("value")
            log_str = f"Console Log: {val_to_log}"
            state["logs"].append(log_str)
            # Add to local node history log
            logs_list = config.get("logs", [])
            logs_list.append(f"[{node_id}] {val_to_log}")
            outputs["outTrigger"] = None
            outputs["logs"] = logs_list
            
        # 6.5. Text Output display
        elif node_type == "textOutputNode":
            val_to_display = inputs.get("value")
            outputs["value"] = val_to_display
            outputs["outTrigger"] = None
            state["logs"].append(f"Text Output node '{node_id}' updated with: {val_to_display}")
            
        # 6.7 For Loop: run the Body chain Count times, publishing the index
        elif node_type == "forLoopNode":
            try:
                count = int(float(inputs.get("count", 3) or 0))
            except (TypeError, ValueError):
                count = 0
            count = max(0, min(1000, count))
            body_edge = next(
                (e for e in state["edges"] if e.get("source") == node_id and e.get("sourceHandle") == "loopBody"),
                None,
            )
            state["logs"].append(f"For Loop starting: {count} iterations.")
            for i in range(count):
                outputs["index"] = i
                state["outputs"][node_id] = dict(outputs)
                _clear_passive_cache(state)
                if body_edge:
                    await run_trigger_chain(body_edge["target"], state)
            state["logs"].append(f"For Loop completed {count} iterations.")

        # 6.8 While Loop: run the Body chain while Condition stays true
        elif node_type == "whileLoopNode":
            body_edge = next(
                (e for e in state["edges"] if e.get("source") == node_id and e.get("sourceHandle") == "loopBody"),
                None,
            )
            iteration = 0
            while iteration < 1000:
                outputs["iteration"] = iteration
                state["outputs"][node_id] = dict(outputs)
                # Re-evaluate the condition's upstream chain each pass — the
                # body may have changed the values feeding it.
                _clear_passive_cache(state)
                cond_val = resolve_inputs(node_id, state).get("condition", False)
                if not _condition_flag(cond_val, state):
                    break
                if body_edge:
                    await run_trigger_chain(body_edge["target"], state)
                iteration += 1
            if iteration >= 1000:
                state["logs"].append("While Loop stopped: 1000-iteration safety cap reached.")
            else:
                state["logs"].append(f"While Loop finished after {iteration} iterations.")

        # 7. Fallback standard calculations (AND, Compare, Constants, etc.)
        else:
            outputs = execute_logic_computation(node_type, inputs, config)

    except Exception as e:
        err_msg = f"Error in node {node_id}: {str(e)}"
        state["logs"].append(err_msg)
        state["error"] = err_msg
        # Store error message inside node outputs for UI mapping
        outputs["errorMessage"] = str(e)
        raise e

    # Update output states
    state["outputs"][node_id] = outputs
    return state


async def run_trigger_chain(start_id: str, state: GraphState, max_steps: int = 5000) -> None:
    """
    Executes a trigger chain sequentially outside LangGraph — used for loop
    bodies. Follows trigger edges node by node, honoring If/Else branching and
    letting nested loops recurse through run_node_task.
    """
    current = start_id
    steps = 0
    while current and steps < max_steps:
        steps += 1
        node = state["nodes"].get(current)
        if not node:
            return
        await run_node_task(current, state)
        ntype = node.get("type")
        if ntype == "ifElseTrigger":
            cond_val = resolve_inputs(current, state).get("condition", False)
            branch = "onTrue" if _condition_flag(cond_val, state) else "onFalse"
            nxt = next(
                (e for e in state["edges"] if e.get("source") == current and e.get("sourceHandle") == branch),
                None,
            )
        elif ntype in LOOP_TYPES:
            # The loop already ran its own body inside run_node_task —
            # continue the chain from its Done port.
            nxt = next(
                (e for e in state["edges"] if e.get("source") == current and e.get("sourceHandle") == "done"),
                None,
            )
        elif ntype == "leakyIntegrateFire":
            # Only continue down the Spike edge if the neuron actually fired
            # this step — otherwise the chain stops here, like a real neuron
            # that stays silent below threshold.
            spiked = state["outputs"].get(current, {}).get("_spiked", False)
            nxt = next(
                (e for e in state["edges"] if e.get("source") == current and e.get("sourceHandle") == "spike"),
                None,
            ) if spiked else None
        else:
            nxt = next(
                (
                    e for e in state["edges"]
                    if e.get("source") == current
                    and _is_trigger_handle(e.get("sourceHandle"))
                    and e.get("sourceHandle") != "loopBody"
                ),
                None,
            )
        current = nxt["target"] if nxt else None


async def compile_and_run_graph(nodes_json: List[Any], edges_json: List[Any]) -> Dict[str, Any]:
    """
    Compiles the Next.js visual node structure into a stateful LangGraph.
    Runs the graph sequence asynchronously and returns execution logs and outputs.
    """
    # 1. Gather active nodes and trigger edges
    active_nodes = [n for n in nodes_json if n.get("type") in ACTIVE_TYPES]
    active_nodes_map = {n["id"]: n for n in active_nodes}
    trigger_edges = [e for e in edges_json if _is_trigger_handle(e.get("sourceHandle"))]

    # 2. Loop-body ownership: nodes reachable from any loop's Body port run
    # inside run_trigger_chain, not as top-level LangGraph nodes.
    body_owned = set()
    stack = [
        e["target"] for e in trigger_edges
        if e.get("sourceHandle") == "loopBody" and e.get("source") in active_nodes_map
    ]
    while stack:
        nid = stack.pop()
        if nid in body_owned:
            continue
        body_owned.add(nid)
        for e in trigger_edges:
            if e.get("source") == nid and e.get("sourceHandle") != "loopBody":
                stack.append(e["target"])

    graph_ids = {nid for nid in active_nodes_map if nid not in body_owned}

    # 3. Plan plain edges and conditional branches
    plain_edges = []
    for edge in trigger_edges:
        source, target = edge.get("source"), edge.get("target")
        if edge.get("sourceHandle") == "loopBody":
            continue
        if source not in graph_ids or target not in graph_ids:
            continue
        src_type = active_nodes_map[source]["type"]
        if src_type == "ifElseTrigger":
            continue
        if src_type == "leakyIntegrateFire":
            continue
        if src_type in LOOP_TYPES and edge.get("sourceHandle") != "done":
            continue
        plain_edges.append((source, target))

    cond_specs = []
    for node in [n for n in active_nodes if n["type"] == "ifElseTrigger" and n["id"] in graph_ids]:
        node_id = node["id"]
        true_targets = [e["target"] for e in edges_json if e["source"] == node_id and e["sourceHandle"] == "onTrue"]
        false_targets = [e["target"] for e in edges_json if e["source"] == node_id and e["sourceHandle"] == "onFalse"]
        true_node = true_targets[0] if true_targets and true_targets[0] in graph_ids else None
        false_node = false_targets[0] if false_targets and false_targets[0] in graph_ids else None
        cond_specs.append((node_id, true_node, false_node))

    # Spike edges from LIF neurons are single-branch conditionals: continue
    # only when the neuron actually fired this step, otherwise stop the chain.
    spike_specs = []
    for node in [n for n in active_nodes if n["type"] == "leakyIntegrateFire" and n["id"] in graph_ids]:
        node_id = node["id"]
        spike_targets = [e["target"] for e in edges_json if e["source"] == node_id and e["sourceHandle"] == "spike"]
        spike_node = spike_targets[0] if spike_targets and spike_targets[0] in graph_ids else None
        spike_specs.append((node_id, spike_node))

    # 4. Entry points
    trigger_nodes = [n for n in active_nodes if n["type"] == "triggerInput" and n["id"] in graph_ids]
    if trigger_nodes:
        entries = [tn["id"] for tn in trigger_nodes]
    elif graph_ids:
        entries = [next(iter(graph_ids))]
    else:
        return {"success": True, "logs": ["No active execution nodes found."], "outputs": {}}

    # 5. Reachability: LangGraph raises on nodes with no path from the entry
    # point, so drop them with a log instead of crashing the whole run
    # (e.g. bridge clones sitting in a dimension with no trigger wiring).
    adjacency = {}
    for source, target in plain_edges:
        adjacency.setdefault(source, []).append(target)
    for node_id, true_node, false_node in cond_specs:
        for t in (true_node, false_node):
            if t:
                adjacency.setdefault(node_id, []).append(t)
    for node_id, spike_node in spike_specs:
        if spike_node:
            adjacency.setdefault(node_id, []).append(spike_node)

    reachable = set()
    frontier = list(entries)
    while frontier:
        nid = frontier.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        frontier.extend(adjacency.get(nid, []))

    skipped = sorted(graph_ids - reachable)
    graph_ids &= reachable
    plain_edges = [(s, t) for s, t in plain_edges if s in graph_ids and t in graph_ids]
    cond_specs = [
        (nid, t if t in graph_ids else None, f if f in graph_ids else None)
        for nid, t, f in cond_specs if nid in graph_ids
    ]
    spike_specs = [
        (nid, s if s in graph_ids else None)
        for nid, s in spike_specs if nid in graph_ids
    ]

    startup_logs = ["Graph compiled successfully. Starting execution."]
    if skipped:
        startup_logs.append(
            f"Skipped {len(skipped)} node(s) with no trigger path from an entry point: {', '.join(skipped)}"
        )

    # 6. Build the LangGraph
    workflow = StateGraph(GraphState)
    for node_id in graph_ids:
        def make_node(nid=node_id):
            async def node_func(state):
                return await run_node_task(nid, state)
            return node_func
        workflow.add_node(node_id, make_node())

    for source, target in plain_edges:
        workflow.add_edge(source, target)

    for node_id, true_node, false_node in cond_specs:
        def route_condition(state, nid=node_id):
            cond_val = resolve_inputs(nid, state).get("condition", False)
            condition = _condition_flag(cond_val, state)
            state["logs"].append(f"If-Else routing decision resolved to: {condition} (from value: '{cond_val}')")
            return "true_path" if condition else "false_path"

        workflow.add_conditional_edges(
            node_id,
            route_condition,
            {
                "true_path": true_node if true_node else END,
                "false_path": false_node if false_node else END,
            },
        )

    for node_id, spike_node in spike_specs:
        def route_spike(state, nid=node_id):
            spiked = state["outputs"].get(nid, {}).get("_spiked", False)
            return "spike_path" if spiked else "no_spike"

        workflow.add_conditional_edges(
            node_id,
            route_spike,
            {
                "spike_path": spike_node if spike_node else END,
                "no_spike": END,
            },
        )

    if len(entries) > 1:
        # Add virtual entry node for parallel execution of multiple dimensions
        async def virtual_node_func(state):
            return {"logs": ["Initiated parallel dimensions execution."]}
        workflow.add_node("virtual_start", virtual_node_func)
        for entry in entries:
            workflow.add_edge("virtual_start", entry)
        workflow.set_entry_point("virtual_start")
    else:
        workflow.set_entry_point(entries[0])

    app = workflow.compile()

    # 7. Initialize State & Invoke
    initial_state: GraphState = {
        "nodes": {n["id"]: n for n in nodes_json},
        "edges": edges_json,
        "outputs": {},
        "logs": startup_logs,
        "error": "",
        "active_node": ""
    }

    try:
        final_state = await app.ainvoke(initial_state)
        return {
            "success": True,
            "logs": final_state["logs"],
            "outputs": final_state["outputs"]
        }
    except Exception as e:
        return {
            "success": False,
            "logs": initial_state["logs"],
            "error": str(e)
        }
