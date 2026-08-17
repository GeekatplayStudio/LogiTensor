"""Graph fixtures shared by the trigger test modules.

Node dicts here carry real `inputs`/`outputs` port declarations (matching
src/types/node-definitions/*.ts), because the engine now classifies an edge by
the declared type of the port it lands on.
"""
import asyncio

from backend.engine import compile_and_run_graph


def node(nid, ntype, inputs, outputs, config=None):
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


def edge(eid, source, handle, target, target_handle):
    return {
        "id": eid,
        "source": source,
        "sourceHandle": handle,
        "target": target,
        "targetHandle": target_handle,
    }


def trigger(nid="t1"):
    return node(nid, "triggerInput", [], [{"id": "triggerOut", "name": "Trigger", "type": "trigger"}])


def logger(nid, value="x"):
    return node(
        nid,
        "loggerNode",
        [
            {"id": "inTrigger", "name": "Log", "type": "trigger"},
            {"id": "value", "name": "Value", "type": "data", "dataType": "any", "value": value},
        ],
        [{"id": "outTrigger", "name": "Out", "type": "trigger"}],
        {"logs": []},
    )


def counter(nid="c1", count=0):
    return node(
        nid,
        "counterNode",
        [
            {"id": "incTrigger", "name": "Inc", "type": "trigger"},
            {"id": "decTrigger", "name": "Dec", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [{"id": "count", "name": "Count", "type": "data", "dataType": "number"}],
        {"count": count},
    )


def range_node(nid="rg", min_val=0, max_val=10, count=0, initial=0, value=0):
    return node(
        nid,
        "rangeNode",
        [
            {"id": "value", "name": "Value", "type": "data", "dataType": "number", "value": value},
            {"id": "checkTrigger", "name": "Check", "type": "trigger"},
            {"id": "resetTrigger", "name": "Reset", "type": "trigger"},
        ],
        [
            {"id": "inRange", "name": "In Range", "type": "data", "dataType": "boolean"},
            {"id": "above", "name": "Above", "type": "data", "dataType": "boolean"},
            {"id": "below", "name": "Below", "type": "data", "dataType": "boolean"},
            {"id": "count", "name": "Count", "type": "data", "dataType": "number"},
        ],
        {"min": min_val, "max": max_val, "count": count, "initialCount": initial},
    )


def const(nid, ntype, value):
    return node(
        nid,
        ntype,
        [],
        [{"id": "value", "name": "Value", "type": "data", "dataType": "any"}],
        {"value": value},
    )


def random_node(nid, lo, hi):
    return node(
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


def run(nodes, edges):
    res = asyncio.run(compile_and_run_graph(nodes, edges))
    assert res["success"] is True, res.get("error")
    return res
