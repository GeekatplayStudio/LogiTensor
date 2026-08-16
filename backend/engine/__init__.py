"""Execution engine package — split from backend/execution_engine.py."""

from backend.engine.state import GraphState, ACTIVE_TYPES, LOOP_TYPES
from backend.engine.helpers import (
    BYPASS_PORTS,
    _is_trigger_handle,
    _coerce_operand,
    _condition_flag,
    _clear_passive_cache,
)
from backend.engine.nn_math import (
    _mulberry32,
    _generate_weights,
    _conv1d_output_positions,
    _conv1d_forward,
    _to_number_vector,
)
from backend.engine.passive import (
    evaluate_passive_node,
    resolve_inputs,
    execute_logic_computation,
)
from backend.engine.active import run_node_task, run_trigger_chain
from backend.engine.compile import compile_and_run_graph

__all__ = [
    "GraphState",
    "ACTIVE_TYPES",
    "LOOP_TYPES",
    "BYPASS_PORTS",
    "evaluate_passive_node",
    "resolve_inputs",
    "execute_logic_computation",
    "run_node_task",
    "run_trigger_chain",
    "compile_and_run_graph",
]
