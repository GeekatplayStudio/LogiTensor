from typing import Dict, List, Any

from langgraph.graph import StateGraph, END

from backend.engine.state import GraphState, ACTIVE_TYPES, LOOP_TYPES
from backend.engine.helpers import _is_trigger_handle, _condition_flag
from backend.engine.passive import resolve_inputs
from backend.engine.active import run_node_task


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
        "active_node": "",
        "trace": []
    }

    try:
        final_state = await app.ainvoke(initial_state)
        return {
            "success": True,
            "logs": final_state["logs"],
            "outputs": final_state["outputs"],
            "trace": final_state.get("trace", [])
        }
    except Exception as e:
        return {
            "success": False,
            "logs": initial_state["logs"],
            "error": str(e)
        }
