"""TS-parity suite: mirrors every computeNodeOutputs case in
src/lib/__tests__/execution-helpers.test.ts against the Python engine's
execute_logic_computation, to catch drift between the hand-mirrored TS and
Python engines. handleTriggerOperation cases are skipped (frontend-only
counter semantics, documented in the code).

Numeric assertions use plain == so an int result satisfies a float
expectation and vice versa (14 == 14.0).
"""

from backend.engine import execute_logic_computation


class TestMathNode:
    """Formula node (mathNode)"""

    def test_computes_arithmetic_over_lettered_inputs(self):
        out = execute_logic_computation("mathNode", {"a": 2, "b": 3, "c": 4}, {"expression": "a + b * c"})
        assert out["out"] == 14

    def test_coerces_numeric_looking_strings_to_numbers(self):
        out = execute_logic_computation("mathNode", {"a": "5", "b": "2.5"}, {"expression": "a + b"})
        assert out["out"] == 7.5

    def test_concatenates_when_inputs_are_real_strings(self):
        out = execute_logic_computation(
            "mathNode",
            {"a": 5, "b": 5, "c": "volts"},
            {"expression": '(a + b) + " " + c'},
        )
        assert out["out"] == "10 volts"

    def test_supports_logical_comparison_expressions(self):
        out = execute_logic_computation("mathNode", {"a": 10, "b": 3}, {"expression": "a > b && b > 0"})
        assert out["out"] is True

    def test_accepts_uppercase_letters_matching_displayed_port_labels(self):
        # Ports are named a/b but the node displays them as A/B — typing the
        # formula using the displayed labels must work identically.
        out = execute_logic_computation("mathNode", {"a": 5, "b": 1}, {"expression": "A+B"})
        assert out["out"] == 6

    def test_treats_mixed_case_identifiers_the_same_as_lowercase(self):
        out = execute_logic_computation("mathNode", {"a": 2, "b": 3, "c": 4}, {"expression": "A + b * C"})
        assert out["out"] == 14


class TestExpressionNode:
    """Safe Expression node (expressionNode)"""

    def test_accepts_uppercase_letters_matching_displayed_xy_labels(self):
        out = execute_logic_computation("expressionNode", {"x": 3, "y": 4}, {"expression": "X * 2 + Y"})
        assert out["out"] == 10


class TestMathFunctionNode:
    def test_applies_unary_and_binary_functions(self):
        assert execute_logic_computation("mathFunctionNode", {"a": -7}, {"op": "abs"})["out"] == 7
        assert execute_logic_computation("mathFunctionNode", {"a": 2, "b": 10}, {"op": "pow"})["out"] == 1024
        assert execute_logic_computation("mathFunctionNode", {"a": 3, "b": 9}, {"op": "min"})["out"] == 3
        assert execute_logic_computation("mathFunctionNode", {"a": 10, "b": 3}, {"op": "mod"})["out"] == 1
        assert execute_logic_computation("mathFunctionNode", {"a": 10, "b": 0}, {"op": "mod"})["out"] == 0


class TestFilterNode:
    def test_passes_value_through_in_include_mode_when_search_matches(self):
        out = execute_logic_computation(
            "filterNode",
            {"value": "Hello World", "search": "world"},
            {"mode": "include", "caseSensitive": False},
        )
        assert out["match"] is True
        assert out["out"] == "Hello World"

    def test_blocks_value_in_include_mode_when_search_misses(self):
        out = execute_logic_computation(
            "filterNode",
            {"value": "Hello World", "search": "mars"},
            {"mode": "include"},
        )
        assert out["match"] is False
        assert out["out"] is None

    def test_inverts_behavior_in_exclude_mode(self):
        out = execute_logic_computation(
            "filterNode",
            {"value": "Hello World", "search": "mars"},
            {"mode": "exclude"},
        )
        assert out["match"] is True
        assert out["out"] == "Hello World"

    def test_honors_case_sensitivity(self):
        out = execute_logic_computation(
            "filterNode",
            {"value": "Hello World", "search": "world"},
            {"mode": "include", "caseSensitive": True},
        )
        assert out["match"] is False


class TestTextNodes:
    def test_transforms_text(self):
        assert execute_logic_computation("stringOpNode", {"text": "hey"}, {"op": "uppercase"})["out"] == "HEY"
        assert execute_logic_computation("stringOpNode", {"text": "  hey  "}, {"op": "trim"})["out"] == "hey"
        assert execute_logic_computation("stringOpNode", {"text": "abc"}, {"op": "length"})["out"] == 3
        assert execute_logic_computation("stringOpNode", {"text": "abc"}, {"op": "reverse"})["out"] == "cba"

    def test_replaces_every_occurrence(self):
        out = execute_logic_computation("replaceTextNode", {"text": "a-b-c", "find": "-", "replace": "+"}, {})
        assert out["out"] == "a+b+c"


class TestLoopNodesPassiveOutputs:
    def test_exposes_current_index_iteration_from_config(self):
        assert execute_logic_computation("forLoopNode", {}, {"index": 4})["index"] == 4
        assert execute_logic_computation("whileLoopNode", {}, {"iteration": 7})["iteration"] == 7


class TestRangeNode:
    def test_flags_below_when_value_is_under_min(self):
        out = execute_logic_computation("rangeNode", {"value": -5}, {"min": 0, "max": 10})
        assert out["below"] is True
        assert out["above"] is False
        assert out["inRange"] is False

    def test_flags_above_when_value_is_over_max(self):
        out = execute_logic_computation("rangeNode", {"value": 15}, {"min": 0, "max": 10})
        assert out["above"] is True
        assert out["below"] is False
        assert out["inRange"] is False

    def test_flags_in_range_when_value_falls_between_min_and_max(self):
        out = execute_logic_computation("rangeNode", {"value": 5}, {"min": 0, "max": 10})
        assert out["inRange"] is True
        assert out["above"] is False
        assert out["below"] is False

    # The TS suite's Check/Reset counter cases use handleTriggerOperation —
    # frontend-only trigger counter semantics — and are intentionally skipped.


class TestAssertNode:
    """Mirrors the assertNode cases in execution-helpers.test.ts."""

    def test_passes_on_equal_values_with_numeric_coercion(self):
        assert execute_logic_computation("assertNode", {"value": 5, "expected": 5}, {})["pass"] is True
        assert execute_logic_computation("assertNode", {"value": 5, "expected": "5"}, {})["pass"] is True
        assert execute_logic_computation("assertNode", {"value": True, "expected": True}, {})["pass"] is True
        assert execute_logic_computation("assertNode", {"value": 5, "expected": 6}, {})["pass"] is False
