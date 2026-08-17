"""Stateful trigger nodes mutate on the backend, according to WHICH port fired.

The engine used to only REFLECT `data.config` for these nodes — a Counter wired
to a Manual Trigger ran, appeared in the trace, and kept its old count forever.
`run_trigger_chain` walks the edges itself, so it knows the `targetHandle` that
fired and can apply the same transitions as handleTriggerOperation on the
frontend (see backend/engine/trigger_state.py).
"""
from backend.tests.graph_builders import counter, edge, logger, node, range_node, run, trigger


def _fire(port, count=0):
    """Manual Trigger -> counter.<port>, returning the run result."""
    return run(
        [trigger(), counter("c1", count)],
        [edge("e1", "t1", "triggerOut", "c1", port)],
    )


# --- Counter ------------------------------------------------------------


def test_counter_increments_on_inc_trigger():
    """The reported repro: this ran but left the count at 3."""
    res = _fire("incTrigger", 3)

    assert res["trace"] == ["t1", "c1"]
    assert res["outputs"]["c1"]["count"] == 4


def test_counter_decrements_on_dec_trigger():
    assert _fire("decTrigger", 3)["outputs"]["c1"]["count"] == 2


def test_counter_zeroes_on_reset_trigger():
    assert _fire("resetTrigger", 7)["outputs"]["c1"]["count"] == 0


def test_counter_counts_once_per_fire_in_a_loop():
    loop = node(
        "loop1",
        "forLoopNode",
        [
            {"id": "inTrigger", "name": "Start", "type": "trigger"},
            {"id": "count", "name": "Count", "type": "data", "dataType": "number", "value": 4},
        ],
        [
            {"id": "loopBody", "name": "Body", "type": "trigger"},
            {"id": "done", "name": "Done", "type": "trigger"},
            {"id": "index", "name": "Index", "type": "data", "dataType": "number"},
        ],
        {"count": 4},
    )
    res = run(
        [trigger(), loop, counter("c1", 0)],
        [
            edge("e1", "t1", "triggerOut", "loop1", "inTrigger"),
            edge("e2", "loop1", "loopBody", "c1", "incTrigger"),
        ],
    )

    assert res["outputs"]["c1"]["count"] == 4


def test_counter_left_alone_when_nothing_fires_it():
    """An undriven Counter still runs (Run means run the board) but nothing
    triggered it, so its stored count must not move."""
    res = run([counter("c1", 5)], [])

    assert res["trace"] == ["c1"]
    assert res["outputs"]["c1"]["count"] == 5


# --- Range --------------------------------------------------------------


def _range_check(value, count=0, initial=0, port="checkTrigger"):
    res = run(
        [trigger(), range_node("rg", 30, 40, count, initial, value)],
        [edge("e1", "t1", "triggerOut", "rg", port)],
    )
    return res["outputs"]["rg"]


def test_range_check_increments_when_value_is_in_range():
    out = _range_check(35, count=2)
    assert out["count"] == 3
    assert out["inRange"] is True


def test_range_check_decrements_when_value_is_out_of_range():
    assert _range_check(99, count=2)["count"] == 1
    assert _range_check(1, count=2)["count"] == 1


def test_range_check_counts_the_boundaries_as_in_range():
    assert _range_check(30, count=0)["count"] == 1
    assert _range_check(40, count=0)["count"] == 1


def test_range_reset_restores_initial_count():
    assert _range_check(99, count=9, initial=4, port="resetTrigger")["count"] == 4


# --- Toggle / SR Latch --------------------------------------------------


def _toggle(nid="tg", state=False):
    return node(
        nid,
        "toggleNode",
        [
            {"id": "inTrigger", "name": "Flip", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [
            {"id": "outTrigger", "name": "Out", "type": "trigger"},
            {"id": "state", "name": "State", "type": "data", "dataType": "boolean"},
        ],
        {"state": state},
    )


def test_toggle_flips_on_each_fire():
    on = run([trigger(), _toggle("tg", False)], [edge("e1", "t1", "triggerOut", "tg", "inTrigger")])
    assert on["outputs"]["tg"]["state"] is True

    off = run([trigger(), _toggle("tg", True)], [edge("e1", "t1", "triggerOut", "tg", "inTrigger")])
    assert off["outputs"]["tg"]["state"] is False


def test_toggle_reset_forces_false():
    res = run([trigger(), _toggle("tg", True)], [edge("e1", "t1", "triggerOut", "tg", "resetTrigger")])
    assert res["outputs"]["tg"]["state"] is False


def _latch(nid="lt", state=False):
    return node(
        nid,
        "latchNode",
        [
            {"id": "setTrigger", "name": "Set", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [
            {"id": "outTrigger", "name": "Out", "type": "trigger"},
            {"id": "state", "name": "State", "type": "data", "dataType": "boolean"},
        ],
        {"state": state},
    )


def test_latch_sets_and_resets():
    set_res = run([trigger(), _latch("lt", False)], [edge("e1", "t1", "triggerOut", "lt", "setTrigger")])
    assert set_res["outputs"]["lt"]["state"] is True

    reset_res = run([trigger(), _latch("lt", True)], [edge("e1", "t1", "triggerOut", "lt", "resetTrigger")])
    assert reset_res["outputs"]["lt"]["state"] is False


# --- Value List / List Append -------------------------------------------


def _value_list(nid="vl", values=None, value=7):
    return node(
        nid,
        "valueListNode",
        [
            {"id": "inTrigger", "name": "Record", "type": "trigger"},
            {"id": "value", "name": "Value", "type": "data", "dataType": "any", "value": value},
        ],
        [
            {"id": "outTrigger", "name": "Out", "type": "trigger"},
            {"id": "list", "name": "List", "type": "data", "dataType": "any"},
            {"id": "length", "name": "Length", "type": "data", "dataType": "number"},
        ],
        {"values": list(values or [])},
    )


def test_value_list_appends_the_current_value():
    res = run(
        [trigger(), _value_list("vl", ["a"], "b")],
        [edge("e1", "t1", "triggerOut", "vl", "inTrigger")],
    )
    assert res["outputs"]["vl"]["list"] == ["a", "b"]
    assert res["outputs"]["vl"]["length"] == 2


def test_value_list_reset_clears_it():
    res = run(
        [trigger(), _value_list("vl", ["a", "b"], "c")],
        [edge("e1", "t1", "triggerOut", "vl", "resetTrigger")],
    )
    assert res["outputs"]["vl"]["list"] == []


def _list_append(nid="la", items=None, value=7):
    return node(
        nid,
        "listAppendNode",
        [
            {"id": "value", "name": "Value", "type": "data", "dataType": "any", "value": value},
            {"id": "inTrigger", "name": "Append", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [
            {"id": "outTrigger", "name": "Out", "type": "trigger"},
            {"id": "list", "name": "List", "type": "data", "dataType": "any"},
            {"id": "length", "name": "Length", "type": "data", "dataType": "number"},
        ],
        {"items": list(items or [])},
    )


def test_list_append_accumulates_then_clears_on_reset():
    appended = run(
        [trigger(), _list_append("la", [1, 2], 3)],
        [edge("e1", "t1", "triggerOut", "la", "inTrigger")],
    )
    assert appended["outputs"]["la"]["list"] == [1, 2, 3]
    assert appended["outputs"]["la"]["length"] == 3

    cleared = run(
        [trigger(), _list_append("la", [1, 2], 3)],
        [edge("e1", "t1", "triggerOut", "la", "resetTrigger")],
    )
    assert cleared["outputs"]["la"]["list"] == []


# --- Once / Sequence ----------------------------------------------------


def _once(nid="on", fired=False):
    return node(
        nid,
        "onceNode",
        [
            {"id": "inTrigger", "name": "In", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [{"id": "outTrigger", "name": "Out", "type": "trigger"}],
        {"fired": fired},
    )


def test_once_passes_the_first_trigger_only():
    """Two Manual Triggers into one Once: the second must not pass through."""
    res = run(
        [trigger("t1"), trigger("t2"), _once("on"), logger("lg")],
        [
            edge("e1", "t1", "triggerOut", "on", "inTrigger"),
            edge("e2", "t2", "triggerOut", "on", "inTrigger"),
            edge("e3", "on", "outTrigger", "lg", "inTrigger"),
        ],
    )

    assert res["trace"] == ["t1", "on", "lg", "t2", "on"]


def test_once_reset_re_arms_it():
    res = run(
        [trigger(), _once("on", fired=True), logger("lg")],
        [
            edge("e1", "t1", "triggerOut", "on", "resetTrigger"),
            edge("e2", "on", "outTrigger", "lg", "inTrigger"),
        ],
    )

    # Reset itself never passes the trigger on, but it does re-arm the node.
    assert res["trace"] == ["t1", "on"]


def _sequence(nid="sq", step=0):
    return node(
        nid,
        "sequenceNode",
        [
            {"id": "inTrigger", "name": "In", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [
            {"id": "out1", "name": "Out 1", "type": "trigger"},
            {"id": "out2", "name": "Out 2", "type": "trigger"},
            {"id": "out3", "name": "Out 3", "type": "trigger"},
        ],
        {"step": step},
    )


def test_sequence_advances_one_output_per_fire():
    res = run(
        [trigger("t1"), trigger("t2"), _sequence("sq"), logger("a"), logger("b"), logger("c")],
        [
            edge("e1", "t1", "triggerOut", "sq", "inTrigger"),
            edge("e2", "t2", "triggerOut", "sq", "inTrigger"),
            edge("e3", "sq", "out1", "a", "inTrigger"),
            edge("e4", "sq", "out2", "b", "inTrigger"),
            edge("e5", "sq", "out3", "c", "inTrigger"),
        ],
    )

    assert res["trace"] == ["t1", "sq", "a", "t2", "sq", "b"]
