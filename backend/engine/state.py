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
}

LOOP_TYPES = {"forLoopNode", "whileLoopNode"}
