"""Trigger fan-out: one trigger output wired to several targets must fire
EVERY target, sequentially, in edge order, with each target's whole downstream
chain finishing before the next target starts.

This used to crash the entire run ("Already found path for node ...") because
each trigger edge was translated into a LangGraph edge; fan-out inside loop
bodies silently dropped every target after the first. Both paths now share
run_trigger_chain.
"""
import asyncio

from backend.engine import compile_and_run_graph


def _node(nid, ntype, inputs, outputs, config=None):
    return {
        "id": nid,
        "type": ntype,
        "data": {
            "label": nid,
            "type": ntype,
            "inputs": inputs,
            "outputs": outputs,
            "config": config or {},
        },
    }


def _trigger(nid="t1"):
    return _node(nid, "triggerInput", [], [{"id": "triggerOut", "name": "Trigger", "type": "trigger"}])


def _random(nid, lo=0, hi=1_000_000):
    return _node(
        nid,
        "randomNode",
        [
            {"id": "inTrigger", "name": "Go", "type": "trigger"},
            {"id": "min", "name": "Min", "type": "data", "dataType": "number", "value": lo},
            {"id": "max", "name": "Max", "type": "data", "dataType": "number", "value": hi},
        ],
        [
            {"id": "outTrigger", "name": "Out", "type": "trigger"},
            {"id": "value", "name": "Value", "type": "data", "dataType": "number"},
        ],
    )


def _logger(nid, value="x"):
    return _node(
        nid,
        "loggerNode",
        [
            {"id": "inTrigger", "name": "Log", "type": "trigger"},
            {"id": "value", "name": "Value", "type": "data", "dataType": "any", "value": value},
        ],
        [{"id": "outTrigger", "name": "Out", "type": "trigger"}],
        {"logs": []},
    )


def _edge(eid, source, handle, target, target_handle="inTrigger"):
    return {
        "id": eid,
        "source": source,
        "sourceHandle": handle,
        "target": target,
        "targetHandle": target_handle,
    }


def _run(nodes, edges):
    res = asyncio.run(compile_and_run_graph(nodes, edges))
    assert res["success"] is True, res.get("error")
    return res


def test_fanout_runs_both_targets():
    """The reported bug: two random generators on one trigger, only one ran."""
    nodes = [_trigger(), _random("r1"), _random("r2")]
    edges = [
        _edge("e1", "t1", "triggerOut", "r1"),
        _edge("e2", "t1", "triggerOut", "r2"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "r1", "r2"]
    assert "value" in res["outputs"]["r1"]
    assert "value" in res["outputs"]["r2"]
    # Independent draws from a wide range — a shared/copied value would be a bug.
    assert res["outputs"]["r1"]["value"] != res["outputs"]["r2"]["value"]


def test_three_way_fanout_preserves_edge_order():
    nodes = [_trigger(), _logger("a"), _logger("b"), _logger("c")]
    edges = [
        _edge("e1", "t1", "triggerOut", "b"),
        _edge("e2", "t1", "triggerOut", "a"),
        _edge("e3", "t1", "triggerOut", "c"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "b", "a", "c"]


def test_fanout_completes_each_branch_before_the_next():
    """Depth-first: branch 1 and its whole chain finish before branch 2 starts."""
    nodes = [_trigger(), _logger("a1"), _logger("a2"), _logger("b1"), _logger("b2")]
    edges = [
        _edge("e1", "t1", "triggerOut", "a1"),
        _edge("e2", "a1", "outTrigger", "a2"),
        _edge("e3", "t1", "triggerOut", "b1"),
        _edge("e4", "b1", "outTrigger", "b2"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "a1", "a2", "b1", "b2"]


def test_fanout_inside_loop_body_fires_every_target_each_iteration():
    loop = _node(
        "loop1",
        "forLoopNode",
        [
            {"id": "inTrigger", "name": "Start", "type": "trigger"},
            {"id": "count", "name": "Count", "type": "data", "dataType": "number", "value": 3},
        ],
        [
            {"id": "loopBody", "name": "Body", "type": "trigger"},
            {"id": "done", "name": "Done", "type": "trigger"},
            {"id": "index", "name": "Index", "type": "data", "dataType": "number"},
        ],
        {"count": 3},
    )
    nodes = [_trigger(), loop, _logger("a"), _logger("b"), _logger("after")]
    edges = [
        _edge("e1", "t1", "triggerOut", "loop1"),
        _edge("e2", "loop1", "loopBody", "a"),
        _edge("e3", "a", "outTrigger", "b"),
        _edge("e4", "loop1", "done", "after"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "loop1", "a", "b", "a", "b", "a", "b", "after"]


def test_fanout_from_loop_body_port_itself():
    """Two chains hanging off one Body port both run, every iteration."""
    loop = _node(
        "loop1",
        "forLoopNode",
        [
            {"id": "inTrigger", "name": "Start", "type": "trigger"},
            {"id": "count", "name": "Count", "type": "data", "dataType": "number", "value": 2},
        ],
        [
            {"id": "loopBody", "name": "Body", "type": "trigger"},
            {"id": "done", "name": "Done", "type": "trigger"},
            {"id": "index", "name": "Index", "type": "data", "dataType": "number"},
        ],
        {"count": 2},
    )
    nodes = [_trigger(), loop, _logger("a"), _logger("b")]
    edges = [
        _edge("e1", "t1", "triggerOut", "loop1"),
        _edge("e2", "loop1", "loopBody", "a"),
        _edge("e3", "loop1", "loopBody", "b"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "loop1", "a", "b", "a", "b"]


def test_fanout_from_if_else_branch():
    branch = _node(
        "if1",
        "ifElseTrigger",
        [
            {"id": "inTrigger", "name": "In", "type": "trigger"},
            {"id": "condition", "name": "Condition", "type": "data", "dataType": "boolean", "value": True},
        ],
        [
            {"id": "onTrue", "name": "True", "type": "trigger"},
            {"id": "onFalse", "name": "False", "type": "trigger"},
        ],
    )
    nodes = [_trigger(), branch, _logger("a"), _logger("b"), _logger("nope")]
    edges = [
        _edge("e1", "t1", "triggerOut", "if1"),
        _edge("e2", "if1", "onTrue", "a"),
        _edge("e3", "if1", "onTrue", "b"),
        _edge("e4", "if1", "onFalse", "nope"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "if1", "a", "b"]
    assert "nope" not in res["trace"]


def test_chain_regression_still_works():
    """Case B: a plain chain is unchanged."""
    nodes = [_trigger(), _random("r1"), _random("r2")]
    edges = [
        _edge("e1", "t1", "triggerOut", "r1"),
        _edge("e2", "r1", "outTrigger", "r2"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "r1", "r2"]
    assert "value" in res["outputs"]["r2"]


def test_unreachable_node_is_reported_not_executed():
    """Case C: r2 is unwired, so it is logged as skipped and never runs."""
    nodes = [_trigger(), _random("r1"), _random("r2")]
    edges = [_edge("e1", "t1", "triggerOut", "r1")]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "r1"]
    assert "r2" not in res["outputs"]
    assert any("no trigger path from an entry point: r2" in line for line in res["logs"])


def test_multiple_entry_points_each_run_their_chain():
    nodes = [_trigger("t1"), _trigger("t2"), _logger("a"), _logger("b")]
    edges = [
        _edge("e1", "t1", "triggerOut", "a"),
        _edge("e2", "t2", "triggerOut", "b"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "a", "t2", "b"]


def test_trigger_cycle_does_not_hang():
    """a -> b -> a is a wiring loop; the branch stops instead of recursing forever."""
    nodes = [_trigger(), _logger("a"), _logger("b")]
    edges = [
        _edge("e1", "t1", "triggerOut", "a"),
        _edge("e2", "a", "outTrigger", "b"),
        _edge("e3", "b", "outTrigger", "a"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "a", "b"]
    assert any("cycle detected" in line for line in res["logs"])


def test_diamond_reconvergence_runs_shared_node_once_per_branch():
    """Not a cycle: `end` is downstream of both branches, so it runs twice."""
    nodes = [_trigger(), _logger("a"), _logger("b"), _logger("end")]
    edges = [
        _edge("e1", "t1", "triggerOut", "a"),
        _edge("e2", "t1", "triggerOut", "b"),
        _edge("e3", "a", "outTrigger", "end"),
        _edge("e4", "b", "outTrigger", "end"),
    ]

    res = _run(nodes, edges)

    assert res["trace"] == ["t1", "a", "end", "b", "end"]
