from typing import Dict, List, Any, TypedDict


# Define the structure of the LangGraph state
class GraphState(TypedDict):
    nodes: Dict[str, Any]
    edges: List[Dict[str, Any]]
    outputs: Dict[str, Dict[str, Any]]
    logs: List[str]
    error: str
    active_node: str
    # Ordered node ids in the order they actually executed. The frontend
    # replays this to highlight one node at a time (paced by the Delay
    # slider) instead of flashing the whole graph green at once.
    trace: List[str]
    # Continuation ports chosen by a node that decides for itself which of its
    # trigger outputs fires (Gate, Once, Sequence) — node id -> handle list.
    next_ports: Dict[str, List[str]]

ACTIVE_TYPES = {
    "triggerInput",
    "delayNode",
    "counterNode",
    "rangeNode",
    "pythonScript",
    "ollamaLLM",
    "ollamaVLM",
    "ifElseTrigger",
    "loggerNode",
    "textOutputNode",
    "forLoopNode",
    "whileLoopNode",
    "randomNode",
    "leakyIntegrateFire",
    # Extended library: trigger-driven nodes. As with counterNode/rangeNode,
    # their stored state lives in `config` and changes according to which
    # trigger port fired (see backend/engine/trigger_state.py).
    "toggleNode",
    "latchNode",
    "listAppendNode",
    "valueListNode",
    "gateNode",
    "onceNode",
    "sequenceNode",
}

LOOP_TYPES = {"forLoopNode", "whileLoopNode"}
