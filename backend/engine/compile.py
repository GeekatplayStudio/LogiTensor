from typing import Any, Dict, List, Set

from langgraph.graph import StateGraph

from backend.engine.state import GraphState, ACTIVE_TYPES
from backend.engine.helpers import _is_trigger_edge
from backend.engine.active import run_entry_point

# LangGraph's default recursion limit is 25 supersteps. Entry points are
# chained linearly (one LangGraph node each), so a board with many entries
# needs a proportionally larger budget or the whole run fails with
# "Recursion limit of 25 reached without hitting a stop condition".
RECURSION_HEADROOM = 50



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


def _data_dependency_order(node_ids: List[str], data_edges: List[Dict[str, Any]]) -> List[str]:
    """Sorts nodes so anything reading another's data output comes after it.

    Depth is measured through DATA edges only, and through intervening passive
    nodes, so a Text Output reading a Math Function that reads two Random
    Numbers sorts after both of them. Hybrid data→trigger edges are excluded by
    the caller: they fire their target, they don't feed it a value, so counting
    them here would both mis-order entries and invent data cycles.
    """
    preds: Dict[str, List[str]] = {}
    for edge in data_edges:
        preds.setdefault(edge.get("target"), []).append(edge.get("source"))

    cache: Dict[str, int] = {}

    def depth(nid: str, seen: Set[str]) -> int:
        if nid in cache:
            return cache[nid]
        if nid in seen:  # data cycle — treat as a root rather than recursing
            return 0
        seen.add(nid)
        d = max((depth(p, seen) + 1 for p in preds.get(nid, [])), default=0)
        cache[nid] = d
        return d

    order = {nid: i for i, nid in enumerate(node_ids)}
    return sorted(node_ids, key=lambda n: (depth(n, set()), order[n]))


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
    nodes_by_id = {n["id"]: n for n in nodes_json}
    active_nodes = [n for n in nodes_json if n.get("type") in ACTIVE_TYPES]
    active_ids = {n["id"] for n in active_nodes}
    # Trigger vs data is decided by the TARGET port, so a hybrid data→trigger
    # wire counts as a trigger edge here — its target is driven, not orphaned.
    trigger_edges = [e for e in edges_json if _is_trigger_edge(e, nodes_by_id)]
    data_edges = [e for e in edges_json if not _is_trigger_edge(e, nodes_by_id)]

    # 1. Entry points. Manual Triggers come first, in authoring order.
    body_owned = _body_owned_ids(trigger_edges, active_ids)
    adjacency = _trigger_adjacency(trigger_edges, active_ids)
    entries = [n["id"] for n in active_nodes if n["type"] == "triggerInput" and n["id"] not in body_owned]

    def _reach(seeds: List[str]) -> Set[str]:
        seen: Set[str] = set()
        frontier = list(seeds)
        while frontier:
            nid = frontier.pop()
            if nid in seen:
                continue
            seen.add(nid)
            frontier.extend(adjacency.get(nid, []))
        return seen

    # Then every active node that nothing else drives: no trigger edge feeds it,
    # no loop owns it, and no Manual Trigger reaches it. Without this, a board
    # wired purely with data edges (say two Random Numbers feeding a Math
    # Function) ran exactly ONE node — the old fallback took `[:1]` — and
    # everything else was reported as "skipped". Run means run the board.
    # Driven means some node that actually EXECUTES fires it. A hybrid
    # data→trigger wire from a passive source (a Boolean constant into a
    # Counter's Inc) drives nothing on its own, so its target stays an entry
    # point — run_entry_point resolves the wire and decides whether it fires.
    driven = {
        e["target"] for e in trigger_edges
        if e.get("target") in active_ids and e.get("source") in active_ids
    }
    reachable = _reach(entries)
    orphans = [
        n["id"] for n in active_nodes
        if n["id"] not in body_owned and n["id"] not in driven and n["id"] not in reachable
    ]
    # Producers must run before consumers, or a consumer would resolve an
    # upstream active node on demand and (for Random Number) get a different
    # value than the one that node publishes when it runs itself.
    entries += _data_dependency_order(orphans, data_edges)

    if not entries:
        return {"success": True, "logs": ["No active execution nodes found."], "outputs": {}, "trace": []}

    # 2. Report — but do not execute — nodes no trigger path can ever reach
    # (e.g. bridge clones sitting in a dimension with no trigger wiring).
    reachable = _reach(entries)

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
                await run_entry_point(eid, state)
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
        "next_ports": {},
    }

    # One superstep per entry, plus headroom for LangGraph's own bookkeeping.
    recursion_limit = len(entries) + RECURSION_HEADROOM

    try:
        final_state = await app.ainvoke(initial_state, config={"recursion_limit": recursion_limit})
        return {
            "success": True,
            "logs": final_state["logs"],
            "outputs": final_state["outputs"],
            "trace": final_state.get("trace", []),
        }
    except Exception as e:
        message = str(e)
        if "recursion limit" in message.lower():
            message = (
                f"{message} (the run was given {recursion_limit} supersteps for "
                f"{len(entries)} entry point(s) — a graph this large needs a bigger budget)"
            )
        initial_state["logs"].append(f"Run failed :: {message}")
        return {
            "success": False,
            "logs": initial_state["logs"],
            "error": message,
        }
