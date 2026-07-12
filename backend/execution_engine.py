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
    "textOutputNode"
}

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
        # Run safe evaluation using our custom library
        outputs["out"] = safe_evaluate(expr, inputs)
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

async def compile_and_run_graph(nodes_json: List[Any], edges_json: List[Any]) -> Dict[str, Any]:
    """
    Compiles the Next.js visual node structure into a stateful LangGraph.
    Runs the graph sequence asynchronously and returns execution logs and outputs.
    """
    # 1. Initialize StateGraph
    workflow = StateGraph(GraphState)
    
    # Map node IDs to nodes dictionary
    nodes_map = {n["id"]: n for n in nodes_json}
    
    # Filter nodes to include only active control flow nodes in LangGraph
    active_nodes = [n for n in nodes_json if n.get("type") in ACTIVE_TYPES]
    active_nodes_map = {n["id"]: n for n in active_nodes}
    
    # 2. Add active LangGraph nodes
    for node_id in active_nodes_map.keys():
        def make_node(nid=node_id):
            async def node_func(state):
                return await run_node_task(nid, state)
            return node_func
        workflow.add_node(node_id, make_node())

    # 3. Add Edges (Control / Trigger flow paths)
    trigger_edges = [
        e for e in edges_json 
        if (e.get("sourceHandle") or "").endswith("Trigger") or 
           e.get("sourceHandle") in ("triggerOut", "outTrigger", "onTrue", "onFalse")
    ]
    
    # Compile standard connection edges
    for edge in trigger_edges:
        source = edge["source"]
        target = edge["target"]
        
        # Only add edge if both source and target are in our active nodes list
        if source in active_nodes_map and target in active_nodes_map:
            # Skip if source is a conditional branching node
            if active_nodes_map[source]["type"] == "ifElseTrigger":
                continue
            workflow.add_edge(source, target)

    # 4. Add Conditional Routing Edges (if/else nodes)
    if_else_nodes = [n for n in active_nodes if n["type"] == "ifElseTrigger"]
    for node in if_else_nodes:
        node_id = node["id"]
        
        # Check connected branches
        true_targets = [e["target"] for e in edges_json if e["source"] == node_id and e["sourceHandle"] == "onTrue"]
        false_targets = [e["target"] for e in edges_json if e["source"] == node_id and e["sourceHandle"] == "onFalse"]
        
        true_node = true_targets[0] if true_targets and true_targets[0] in active_nodes_map else END
        false_node = false_targets[0] if false_targets and false_targets[0] in active_nodes_map else END

        def route_condition(state, nid=node_id, t_node=true_node, f_node=false_node):
            inputs = resolve_inputs(nid, state)
            cond_val = inputs.get("condition", False)
            if isinstance(cond_val, str):
                trimmed = cond_val.strip().lower()
                if trimmed in ("true", "1", "yes"):
                    condition = True
                elif trimmed in ("false", "0", "no", ""):
                    condition = False
                else:
                    try:
                        # Build context from other node output values
                        context = {}
                        for source_nid, node_outs in state["outputs"].items():
                            for port_id, val in node_outs.items():
                                context[f"{source_nid}_{port_id}"] = val
                                if len(node_outs) == 1 or port_id in ("value", "out", "result", "response"):
                                    context[source_nid] = val
                        resolved = safe_evaluate(cond_val, context)
                        condition = bool(resolved)
                    except Exception as e:
                        state["logs"].append(f"Condition expression evaluation failed: {str(e)}. Defaulting to False.")
                        condition = False
            else:
                condition = bool(cond_val)
            
            state["logs"].append(f"If-Else routing decision resolved to: {condition} (from value: '{cond_val}')")
            return "true_path" if condition else "false_path"

        workflow.add_conditional_edges(
            node_id,
            route_condition,
            {
                "true_path": true_node,
                "false_path": false_node
            }
        )

    # 5. Determine Entry Points
    trigger_nodes = [n for n in active_nodes if n["type"] == "triggerInput"]
    if len(trigger_nodes) > 1:
        # Add virtual entry node for parallel execution of multiple dimensions
        async def virtual_node_func(state):
            return {"logs": ["Initiated parallel dimensions execution."]}
        workflow.add_node("virtual_start", virtual_node_func)
        
        # Connect virtual entry to all layer triggers
        for tn in trigger_nodes:
            workflow.add_edge("virtual_start", tn["id"])
            
        workflow.set_entry_point("virtual_start")
    elif trigger_nodes:
        # Set first trigger node as graph start
        workflow.set_entry_point(trigger_nodes[0]["id"])
    else:
        # Fallback start (first active node)
        if active_nodes:
            workflow.set_entry_point(active_nodes[0]["id"])
        else:
            return {"logs": ["No active execution nodes found."], "outputs": {}}

    # 6. Compile Graph
    app = workflow.compile()

    # 7. Initialize State & Invoke
    initial_state: GraphState = {
        "nodes": {n["id"]: n for n in nodes_json},
        "edges": edges_json,
        "outputs": {},
        "logs": ["Graph compiled successfully. Starting execution."],
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
