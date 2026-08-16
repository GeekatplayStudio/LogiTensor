"""The frontend replays this trace to highlight one node at a time (paced by
the Delay slider). Without an ordered trace the canvas flashed every node
green at once, so the ordering here is a real UI contract, not a detail."""
import asyncio

from backend.engine import compile_and_run_graph


def _node(nid, ntype, label, inputs, outputs, config=None):
    return {
        "id": nid,
        "type": ntype,
        "data": {
            "label": label,
            "type": ntype,
            "inputs": inputs,
            "outputs": outputs,
            "config": config or {},
        },
    }


def _logger(nid, label, value):
    return _node(
        nid,
        "loggerNode",
        label,
        [
            {"id": "inTrigger", "name": "Log", "type": "trigger"},
            {"id": "value", "name": "Value", "type": "data", "dataType": "any", "value": value},
        ],
        [{"id": "outTrigger", "name": "Out", "type": "trigger"}],
        {"logs": []},
    )


def test_trace_records_nodes_in_execution_order():
    nodes = [
        _node("t1", "triggerInput", "Manual Trigger", [], [{"id": "triggerOut", "name": "Trigger", "type": "trigger"}]),
        _logger("log1", "First", "hello"),
        _logger("log2", "Second", "world"),
    ]
    edges = [
        {"id": "e1", "source": "t1", "sourceHandle": "triggerOut", "target": "log1", "targetHandle": "inTrigger"},
        {"id": "e2", "source": "log1", "sourceHandle": "outTrigger", "target": "log2", "targetHandle": "inTrigger"},
    ]

    res = asyncio.run(compile_and_run_graph(nodes, edges))

    assert res["success"] is True
    assert res["trace"] == ["t1", "log1", "log2"]
