import asyncio
import base64
import os
from typing import Any, Dict, List

import ollama

from backend.security import validate_python_code
from backend.engine.state import GraphState, ACTIVE_TYPES, LOOP_TYPES
from backend.engine.helpers import (
    _condition_flag,
    _clear_passive_cache,
    _is_data_source,
    _is_trigger_edge,
)
from backend.engine.passive import (
    evaluate_passive_node,
    resolve_inputs,
    execute_logic_computation,
)
from backend.engine.trigger_state import (
    DEFAULT_PORTS,
    TRIGGER_STATE_TYPES,
    apply_trigger_state,
    reflect_state_outputs,
    resolve_trigger_fire,
)


def _loop_body_edges(node_id: str, state: GraphState) -> List[Dict[str, Any]]:
    """Every edge leaving a loop node's Body port, in authoring order — a loop
    body may fan out to several independent chains per iteration."""
    return [
        e for e in state["edges"]
        if e.get("source") == node_id and e.get("sourceHandle") == "loopBody"
    ]


async def run_node_task(node_id: str, state: GraphState, fired_port: str = None) -> GraphState:
    """
    Executes a single node, resolving inputs, running computations
    or external API calls, updating outputs, and appending logs.

    `fired_port` is the trigger INPUT handle that caused this execution (None
    for an entry point nothing drove). Stateful nodes need it: a Counter fired
    on Inc counts up, on Dec counts down, on Reset zeroes.
    """
    node = state["nodes"][node_id]
    node_type = node["type"]
    config = node["data"].get("config", {})
    inputs = resolve_inputs(node_id, state)

    outputs = {}
    log_msg = f"Executing node {node_id} ({node['data']['label']})"
    state["logs"].append(log_msg)
    state["active_node"] = node_id
    # Record execution order for the frontend's step-by-step replay.
    state.setdefault("trace", []).append(node_id)

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

        # 5. Trigger-driven stateful nodes (Counter, Range, Toggle, SR Latch,
        # List Append, Value List, Gate, Once, Sequence). Which port fired
        # decides the state transition — see backend/engine/trigger_state.py,
        # the mirror of handleTriggerOperation.
        elif node_type in TRIGGER_STATE_TYPES:
            new_config, next_ports = apply_trigger_state(node_type, inputs, config, fired_port)
            if new_config is not None:
                node["data"]["config"] = new_config
                config = new_config
                state["logs"].append(
                    f"{node_type} '{node_id}' fired on '{fired_port}' -> {new_config}"
                )
            outputs = reflect_state_outputs(node_type, inputs, config, execute_logic_computation)
            if next_ports is not DEFAULT_PORTS:
                state.setdefault("next_ports", {})[node_id] = list(next_ports)
            else:
                state.setdefault("next_ports", {}).pop(node_id, None)

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
            body_edges = _loop_body_edges(node_id, state)
            state["logs"].append(f"For Loop starting: {count} iterations.")
            for i in range(count):
                outputs["index"] = i
                state["outputs"][node_id] = dict(outputs)
                _clear_passive_cache(state)
                for body_edge in body_edges:
                    await run_trigger_chain(
                        body_edge["target"], state, fired_port=body_edge.get("targetHandle")
                    )
            state["logs"].append(f"For Loop completed {count} iterations.")

        # 6.8 While Loop: run the Body chain while Condition stays true
        elif node_type == "whileLoopNode":
            body_edges = _loop_body_edges(node_id, state)
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
                for body_edge in body_edges:
                    await run_trigger_chain(
                        body_edge["target"], state, fired_port=body_edge.get("targetHandle")
                    )
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


def next_trigger_edges(node_id: str, state: GraphState) -> List[Dict[str, Any]]:
    """
    Returns EVERY trigger edge the chain should follow out of `node_id`, in
    the order the edges were authored. A trigger output may be wired to any
    number of targets (fan-out); returning a list rather than the first match
    is what makes that work.

    Which port fires is node-type dependent: If/Else picks one branch, loops
    continue from Done (their Body already ran inside run_node_task), an LIF
    neuron only continues down Spike when it actually fired, and the stateful
    nodes (Gate, Once, Sequence) recorded their choice in `state["next_ports"]`.

    Hybrid data→trigger edges count too: a DATA output wired into a trigger
    INPUT fires that target when its value reads as "on". The frontend fires
    those on a RISING edge (it remembers each port's previous value across
    interactive steps); one stateless backend pass has no previous value, so
    this is level-triggered — the faithful approximation of a single run.
    """
    nodes = state["nodes"]
    ntype = (nodes.get(node_id) or {}).get("type")
    edges = state["edges"]

    chosen = state.get("next_ports", {}).get(node_id)
    if chosen is not None:
        handles = set(chosen)
    elif ntype == "ifElseTrigger":
        cond_val = resolve_inputs(node_id, state).get("condition", False)
        handles = {"onTrue" if _condition_flag(cond_val, state) else "onFalse"}
    elif ntype in LOOP_TYPES:
        handles = {"done"}
    elif ntype == "leakyIntegrateFire":
        # Silent neuron: the trigger chain stops here (data still propagates).
        handles = {"spike"} if state["outputs"].get(node_id, {}).get("_spiked", False) else set()
    else:
        handles = None  # every wired trigger output

    result = []
    for edge in edges:
        if edge.get("source") != node_id or not _is_trigger_edge(edge, nodes):
            continue
        if _is_data_source(edge, nodes):
            if resolve_trigger_fire(state["outputs"].get(node_id, {}).get(edge.get("sourceHandle"))):
                result.append(edge)
            continue
        handle = edge.get("sourceHandle")
        if handle == "loopBody":
            continue
        if handles is None or handle in handles:
            result.append(edge)
    return result


async def run_trigger_chain(
    start_id: str,
    state: GraphState,
    max_steps: int = 5000,
    _budget: Dict[str, int] = None,
    _path: List[str] = None,
    fired_port: str = None,
) -> None:
    """
    Executes a trigger chain sequentially, depth-first, in edge order — the
    single execution path for the whole engine (top-level entry points as well
    as loop bodies).

    Fan-out: when a trigger port feeds several targets, each target's ENTIRE
    downstream chain completes before the next target starts, mirroring the
    frontend's awaited recursion.

    Structure note: the linear tail is walked with a `while` loop and only the
    extra fan-out branches recurse, so a long straight chain costs O(1) stack
    depth — recursion depth tracks branching, not chain length.

    Runaway protection is two-layered:
      * `_budget` — a shared node-execution count across the whole recursion,
        capped at `max_steps` (the original guard).
      * `_path` — the ids currently on the DFS path. Re-entering one means the
        trigger wiring loops back on itself, which would recurse forever, so
        that branch stops. Diamonds (two branches re-converging on one node)
        are NOT cycles and still run the shared node once per branch.
    """
    budget = _budget if _budget is not None else {"steps": 0}
    path = _path if _path is not None else []
    entered = 0
    current, current_port = start_id, fired_port

    try:
        while current:
            if state["nodes"].get(current) is None:
                return
            if current in path:
                state["logs"].append(
                    f"Trigger cycle detected at node {current}; stopping this branch."
                )
                return
            if budget["steps"] >= max_steps:
                state["logs"].append(
                    f"Trigger chain stopped: {max_steps}-step safety cap reached."
                )
                return
            budget["steps"] += 1

            await run_node_task(current, state, current_port)
            path.append(current)
            entered += 1

            nxts = next_trigger_edges(current, state)
            if not nxts:
                return
            # All but the last branch recurse; the last continues this loop so
            # straight chains stay iterative.
            for edge in nxts[:-1]:
                await run_trigger_chain(
                    edge["target"], state, max_steps, budget, path, edge.get("targetHandle")
                )
            current, current_port = nxts[-1]["target"], nxts[-1].get("targetHandle")
    finally:
        del path[len(path) - entered:]


async def run_entry_point(entry_id: str, state: GraphState) -> None:
    """
    Starts a chain at a top-level entry point.

    An entry may be driven purely by hybrid data→trigger wires whose sources
    are PASSIVE nodes (a Boolean constant into a Counter's Inc, say). Nothing
    ever executes those sources, so the entry resolves them itself and fires
    once per wire that reads as "on" — and does not run at all when none do,
    which is what makes `constBool(false) -> counter.incTrigger` correctly do
    nothing instead of running the counter as an undriven orphan.
    """
    hybrid = [
        e for e in state["edges"]
        if e.get("target") == entry_id
        and state["nodes"].get(e.get("source"), {}).get("type") not in ACTIVE_TYPES
        and _is_trigger_edge(e, state["nodes"])
        and _is_data_source(e, state["nodes"])
    ]
    if not hybrid:
        await run_trigger_chain(entry_id, state)
        return

    for edge in hybrid:
        value = evaluate_passive_node(edge["source"], state).get(edge.get("sourceHandle"))
        if resolve_trigger_fire(value):
            await run_trigger_chain(entry_id, state, fired_port=edge.get("targetHandle"))
