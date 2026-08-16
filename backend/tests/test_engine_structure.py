"""Structural tests for the split backend/engine package."""

from backend.engine import execute_logic_computation
from backend.engine.nn_math import _conv1d_output_positions


def test_bypass_passes_primary_input_through_when_disabled():
    out = execute_logic_computation("compareNode", {"a": 5, "b": 1, "enabled": False}, {"op": ">"})
    assert out == {"out": 5}


def test_conv1d_output_positions_edge_cases():
    # Input shorter than kernel -> no valid positions
    assert _conv1d_output_positions(2, 3, 1) == 0
    assert _conv1d_output_positions(0, 1, 1) == 0
    # Degenerate kernel/stride
    assert _conv1d_output_positions(5, 0, 1) == 0
    assert _conv1d_output_positions(5, 3, 0) == 0
    # Normal cases
    assert _conv1d_output_positions(5, 3, 1) == 3
    assert _conv1d_output_positions(5, 3, 2) == 2
