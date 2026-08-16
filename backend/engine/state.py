from typing import Dict, List, Any, TypedDict


# Define the structure of the LangGraph state
class GraphState(TypedDict):
    nodes: Dict[str, Any]
    edges: List[Dict[str, Any]]
    outputs: Dict[str, Dict[str, Any]]
    logs: List[str]
    error: str
    active_node: str

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
