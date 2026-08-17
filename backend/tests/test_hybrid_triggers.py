"""Hybrid data→trigger wires, and the recursion limit for many entry points.

A boolean/number DATA output may be wired straight into a trigger INPUT (the
frontend's "hybrid trigger" connection). The engine used to classify an edge by
its SOURCE handle's NAME, so those wires read as plain data edges: the target
never fired, was miscounted as an undriven orphan (which is the only reason it
showed up in the trace at all), and the wire even faked a data-dependency cycle
that mis-ordered the entry points.
"""
import asyncio

from backend.engine import compile_and_run_graph
from backend.tests.graph_builders import (
    const,
    counter,
    edge,
    logger,
    random_node,
    range_node,
    run,
    trigger,
)


def _hybrid_counter_run(source_node, source_id="src"):
    return run(
        [source_node, counter("c1", 0)],
        [edge("e1", source_id, "value", "c1", "incTrigger")],
    )


def test_hybrid_true_boolean_fires_the_counter():
    """The reported repro: constBool(true) -> counter.incTrigger did nothing."""
    res = _hybrid_counter_run(const("src", "constBool", True))

    assert res["trace"] == ["c1"]
    assert res["outputs"]["c1"]["count"] == 1


def test_hybrid_false_boolean_does_not_fire_the_counter():
    res = _hybrid_counter_run(const("src", "constBool", False))

    assert res["trace"] == []
    assert "c1" not in res["outputs"]


def test_hybrid_positive_number_fires_and_zero_does_not():
    fired = _hybrid_counter_run(const("src", "constNum", 5))
    assert fired["outputs"]["c1"]["count"] == 1

    silent = _hybrid_counter_run(const("src", "constNum", 0))
    assert silent["trace"] == []


def test_hybrid_wire_makes_the_target_downstream_not_an_orphan():
    """Range fires the Counter itself, so the Counter is no longer run as an
    independent entry point — and Range runs AFTER the Random feeding it."""
    res = run(
        [random_node("rnd", 35, 35), range_node("rg", 30, 40), counter("c1", 0)],
        [
            edge("d1", "rnd", "value", "rg", "value"),
            edge("h1", "rg", "inRange", "c1", "incTrigger"),
        ],
    )

    assert res["trace"] == ["rnd", "rg", "c1"]
    assert res["outputs"]["c1"]["count"] == 1


# --- The user's feedback-loop shape -------------------------------------


def _user_graph(low, high):
    """Random -> Range(30..40), with a Counter on Below and one on Above."""
    return (
        [random_node("rnd", low, high), range_node("rg", 30, 40), counter("cbelow", 0), counter("cabove", 0)],
        [
            edge("d1", "rnd", "value", "rg", "value"),
            edge("h1", "rg", "below", "cbelow", "incTrigger"),
            edge("h2", "rg", "above", "cabove", "incTrigger"),
        ],
    )


def test_user_shape_fires_exactly_the_branch_that_is_true():
    for low, high, hot, cold in ((1, 1, "cbelow", "cabove"), (99, 99, "cabove", "cbelow")):
        nodes, edges = _user_graph(low, high)
        res = run(nodes, edges)

        # Random Number first: Range used to run BEFORE the node feeding it.
        assert res["trace"][:2] == ["rnd", "rg"], res["trace"]
        assert res["outputs"][hot]["count"] == 1
        # The other branch was false, so its Counter must not have run at all —
        # the old engine ran it regardless, as an "undriven" node.
        assert cold not in res["trace"]
        assert cold not in res["outputs"]


def test_user_shape_in_range_fires_neither_counter():
    nodes, edges = _user_graph(35, 35)
    res = run(nodes, edges)

    assert res["trace"] == ["rnd", "rg"]
    assert res["outputs"]["rg"]["inRange"] is True


# --- Recursion limit ----------------------------------------------------


def test_many_entry_points_do_not_hit_the_recursion_limit():
    """Entries are chained one per LangGraph superstep, so 30 Manual Triggers
    need 31 — past the default limit of 25, which is what failed the user's
    multi-dimensional board with "Recursion limit of 25 reached without hitting
    a stop condition"."""
    nodes = []
    edges = []
    for i in range(30):
        nodes.append(trigger(f"t{i}"))
        nodes.append(logger(f"lg{i}"))
        edges.append(edge(f"e{i}", f"t{i}", "triggerOut", f"lg{i}", "inTrigger"))

    res = asyncio.run(compile_and_run_graph(nodes, edges))

    assert res["success"] is True, res.get("error")
    assert len(res["trace"]) == 60
    assert not any("ecursion limit" in line for line in res["logs"])
