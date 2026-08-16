import asyncio
import base64
import os

import ollama

from backend.security import validate_python_code
from backend.engine.state import GraphState, LOOP_TYPES
from backend.engine.helpers import _is_trigger_handle, _condition_flag, _clear_passive_cache
from backend.engine.passive import resolve_inputs, execute_logic_computation


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

        # 5. Incremental Counter update
        elif node_type == "counterNode":
            # Values are updated on the frontend when trigger flow hits it.
            # Here we just resolve its output count.
            outputs["count"] = int(config.get("count", 0))

        # 5.1. Range check — recompute inRange/above/below fresh (pure), but
        # like counterNode above, count is mutated on the frontend when a
        # trigger fires (Check vs Reset) and this stub can't tell which of
        # its two trigger ports fired, so it just reflects the current count.
        elif node_type == "rangeNode":
            value = float(inputs.get("value", 0) or 0)
            min_val = float(config.get("min", 0) or 0)
            max_val = float(config.get("max", 0) or 0)
            in_range = min_val <= value <= max_val
            outputs["above"] = value > max_val
            outputs["below"] = value < min_val
            outputs["inRange"] = in_range
            outputs["count"] = int(config.get("count", config.get("initialCount", 0)) or 0)
            state["logs"].append(f"Range check: value={value} in [{min_val}, {max_val}] -> {in_range}")

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
