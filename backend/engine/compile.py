from typing import Any, Dict, List, Set

from langgraph.graph import StateGraph

from backend.engine.state import GraphState, ACTIVE_TYPES
from backend.engine.helpers import _is_trigger_handle
from backend.engine.active import run_trigger_chain


def _trigger_adjacency(trigger_edges: List[Dict[str, Any]], active_ids: Set[str]) -> Dict[str, List[str]]:
    """Every trigger edge between two active nodes, including loopBody edges —
    loop bodies do execute, so their nodes must count as reachable."""
    adjacency: Dict[str, List[str]] = {}
    for edge in trigger_edges:
        source, target = edge.get("source"), edge.get("target")
        if source in active_ids and target in active_ids:
            adjacency.setdefault(source, []).append(target)
    return adjacency


def _body_owned_ids(trigger_edges: List[Dict[str, Any]], active_ids: Set[str]) -> Set[str]:
    """Nodes that live inside some loop's Body chain. They are never entry
    points of their own — the loop node drives them, once per iteration."""
    owned: Set[str] = set()
    stack = [
        e["target"] for e in trigger_edges
        if e.get("sourceHandle") == "loopBody" and e.get("source") in active_ids
    ]
    while stack:
        nid = stack.pop()
        if nid in owned:
            continue
        owned.add(nid)
        for e in trigger_edges:
            if e.get("source") == nid and e.get("sourceHandle") != "loopBody":
                stack.append(e["target"])
    return owned


async def compile_and_run_graph(nodes_json: List[Any], edges_json: List[Any]) -> Dict[str, Any]:
    """
    Runs the Next.js visual node structure and returns execution logs, outputs
    and the ordered execution trace.

    Structure: LangGraph orchestrates only the ENTRY POINTS (the Manual
    Triggers), chained one after another. Everything downstream of an entry is
    walked by `run_trigger_chain`, which is also what loop bodies use — one
    execution path for the whole engine.

    This replaced a scheme that translated every inter-node trigger edge into a
    LangGraph edge. That could not express trigger fan-out at all: two edges
    off one trigger port made `add_edge` raise "Already found path for node",
    failing the entire run. Chaining entries linearly (rather than fanning them
    out from a virtual start) also means only one node writes GraphState per
    step, so the plain-TypedDict LastValue channels can never see concurrent
    writes.
    """
    active_nodes = [n for n in nodes_json if n.get("type") in ACTIVE_TYPES]
    active_ids = {n["id"] for n in active_nodes}
    trigger_edges = [e for e in edges_json if _is_trigger_handle(e.get("sourceHandle"))]

    # 1. Entry points: the Manual Triggers, in authoring order. With none, fall
    # back to the first active node that isn't owned by a loop body.
    body_owned = _body_owned_ids(trigger_edges, active_ids)
    entries = [n["id"] for n in active_nodes if n["type"] == "triggerInput" and n["id"] not in body_owned]
    if not entries:
        entries = [n["id"] for n in active_nodes if n["id"] not in body_owned][:1]
    if not entries:
        return {"success": True, "logs": ["No active execution nodes found."], "outputs": {}, "trace": []}

    # 2. Report — but do not execute — nodes no trigger path can ever reach
    # (e.g. bridge clones sitting in a dimension with no trigger wiring).
    adjacency = _trigger_adjacency(trigger_edges, active_ids)
    reachable: Set[str] = set()
    frontier = list(entries)
    while frontier:
        nid = frontier.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        frontier.extend(adjacency.get(nid, []))

    startup_logs = ["Graph compiled successfully. Starting execution."]
    skipped = sorted(active_ids - reachable)
    if skipped:
        startup_logs.append(
            f"Skipped {len(skipped)} node(s) with no trigger path from an entry point: {', '.join(skipped)}"
        )

    # 3. One LangGraph node per entry point, run back to back.
    workflow = StateGraph(GraphState)
    for entry_id in entries:
        def make_entry(eid=entry_id):
            async def entry_func(state):
                await run_trigger_chain(eid, state)
                return state
            return entry_func
        workflow.add_node(entry_id, make_entry())

    for source, target in zip(entries, entries[1:]):
        workflow.add_edge(source, target)
    workflow.set_entry_point(entries[0])

    app = workflow.compile()

    initial_state: GraphState = {
        "nodes": {n["id"]: n for n in nodes_json},
        "edges": edges_json,
        "outputs": {},
        "logs": startup_logs,
        "error": "",
        "active_node": "",
        "trace": [],
    }

    try:
        final_state = await app.ainvoke(initial_state)
        return {
            "success": True,
            "logs": final_state["logs"],
            "outputs": final_state["outputs"],
            "trace": final_state.get("trace", []),
        }
    except Exception as e:
        return {
            "success": False,
            "logs": initial_state["logs"],
            "error": str(e),
        }
