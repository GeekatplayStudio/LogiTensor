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


# ---------------------------------------------------------------------------
# Extended node library â€” mirrors the matching describe() blocks in
# src/lib/__tests__/execution-helpers.test.ts.
# ---------------------------------------------------------------------------


class TestNewInputNodes:
    def test_slider_clamps_into_configured_bounds(self):
        assert execute_logic_computation("sliderInput", {}, {"value": 150, "min": 0, "max": 100})["value"] == 100
        assert execute_logic_computation("sliderInput", {}, {"value": -5, "min": 0, "max": 100})["value"] == 0

    def test_multiline_text_passes_straight_through(self):
        assert execute_logic_computation("textAreaInput", {}, {"value": "a\nb"})["value"] == "a\nb"

    def test_current_time_emits_epoch_and_formatted_string(self):
        out = execute_logic_computation("currentTimeNode", {}, {})
        assert isinstance(out["epoch"], int)
        assert isinstance(out["formatted"], str)


class TestNewLogicNodes:
    def test_xnor_is_true_only_when_inputs_agree(self):
        assert execute_logic_computation("xnorGate", {"a": True, "b": True}, {})["out"] is True
        assert execute_logic_computation("xnorGate", {"a": True, "b": False}, {})["out"] is False

    def test_toggle_and_latch_republish_stored_state(self):
        assert execute_logic_computation("toggleNode", {}, {"state": True})["state"] is True
        assert execute_logic_computation("latchNode", {}, {"state": False})["state"] is False


class TestNewMathCompareNodes:
    def test_clamps_a_value_into_min_max(self):
        assert execute_logic_computation("clampNode", {"value": 15, "min": 0, "max": 10}, {})["out"] == 10
        assert execute_logic_computation("clampNode", {"value": -3, "min": 0, "max": 10}, {})["out"] == 0

    def test_maps_a_value_from_one_range_onto_another(self):
        out = execute_logic_computation(
            "mapRangeNode",
            {"value": 512, "inMin": 0, "inMax": 1024, "outMin": 0, "outMax": 100},
            {},
        )
        assert out["out"] == 50

    def test_zero_width_source_range_collapses_to_out_min(self):
        out = execute_logic_computation(
            "mapRangeNode",
            {"value": 3, "inMin": 5, "inMax": 5, "outMin": 7, "outMax": 9},
            {},
        )
        assert out["out"] == 7

    def test_interpolates_between_a_and_b_by_t(self):
        assert execute_logic_computation("lerpNode", {"a": 0, "b": 10, "t": 0.25}, {})["out"] == 2.5

    def test_between_honours_the_inclusive_flag(self):
        assert execute_logic_computation("betweenNode", {"value": 5, "min": 0, "max": 10}, {})["out"] is True
        out = execute_logic_computation("betweenNode", {"value": 10, "min": 0, "max": 10}, {"inclusive": False})
        assert out["out"] is False

    def test_rounds_to_n_decimals_half_up(self):
        assert execute_logic_computation("roundToNode", {"value": 3.14159}, {"decimals": 2})["out"] == 3.14
        assert execute_logic_computation("roundToNode", {"value": 2.5}, {"decimals": 0})["out"] == 3

    def test_bypasses_to_primary_input_when_disabled(self):
        out = execute_logic_computation("clampNode", {"value": 99, "min": 0, "max": 1, "enabled": False}, {})
        assert out["out"] == 99


class TestNewDataTextNodes:
    def test_splits_text_into_a_list_and_counts_parts(self):
        out = execute_logic_computation("splitTextNode", {"text": "a,b,c", "delimiter": ","}, {})
        assert out["list"] == ["a", "b", "c"]
        assert out["count"] == 3

    def test_joins_a_list_with_a_delimiter(self):
        out = execute_logic_computation("joinTextNode", {"list": [1, 2, 3], "delimiter": "-"}, {})
        assert out["out"] == "1-2-3"

    def test_substring_counts_negative_starts_from_the_end(self):
        assert execute_logic_computation(
            "substringNode", {"text": "LogiBoard", "start": 4, "length": 5}, {}
        )["out"] == "Board"
        assert execute_logic_computation(
            "substringNode", {"text": "LogiBoard", "start": -5, "length": 5}, {}
        )["out"] == "Board"

    def test_fills_template_placeholders_in_either_case(self):
        out = execute_logic_computation("templateNode", {"a": "cat", "b": 3}, {"template": "{a} has {B}"})
        assert out["out"] == "cat has 3"

    def test_parses_json_and_reports_validity(self):
        ok = execute_logic_computation("jsonParseNode", {"text": '{"x":1}'}, {})
        assert ok["out"] == {"x": 1}
        assert ok["valid"] is True
        assert execute_logic_computation("jsonParseNode", {"text": "nope"}, {})["valid"] is False

    def test_stringifies_values_compactly(self):
        assert execute_logic_computation("jsonStringifyNode", {"value": {"a": 1}}, {})["out"] == '{"a":1}'

    def test_converts_between_number_string_and_boolean(self):
        assert execute_logic_computation("toNumberNode", {"value": "42"}, {})["out"] == 42
        assert execute_logic_computation("toNumberNode", {"value": "abc"}, {})["out"] == 0
        assert execute_logic_computation("toStringNode", {"value": [1, 2]}, {})["out"] == "[1,2]"
        assert execute_logic_computation("toBooleanNode", {"value": "false"}, {})["out"] is False
        assert execute_logic_computation("toBooleanNode", {"value": "yes"}, {})["out"] is True

    def test_matches_a_regex_and_returns_the_first_match(self):
        out = execute_logic_computation("regexMatchNode", {"text": "abc123", "pattern": r"\d+"}, {})
        assert out["matched"] is True
        assert out["match"] == "123"

    def test_invalid_regex_is_no_match_rather_than_an_error(self):
        out = execute_logic_computation("regexMatchNode", {"text": "abc", "pattern": "("}, {})
        assert out["matched"] is False
        assert out["match"] == ""


class TestListsCategory:
    def test_reports_list_length(self):
        assert execute_logic_computation("listLengthNode", {"list": [1, 2, 3]}, {})["length"] == 3

    def test_gets_entry_by_index_supporting_negatives(self):
        assert execute_logic_computation("listGetNode", {"list": [1, 2, 3], "index": -1}, {})["item"] == 3
        assert execute_logic_computation("listGetNode", {"list": [1, 2, 3], "index": 5}, {})["found"] is False

    def test_aggregates_a_list_of_numbers(self):
        items = {"list": [1, 2, 3]}
        assert execute_logic_computation("listStatsNode", items, {"op": "sum"})["out"] == 6
        assert execute_logic_computation("listStatsNode", items, {"op": "avg"})["out"] == 2
        assert execute_logic_computation("listStatsNode", items, {"op": "min"})["out"] == 1
        assert execute_logic_computation("listStatsNode", items, {"op": "max"})["out"] == 3
        assert execute_logic_computation("listStatsNode", items, {"op": "count"})["out"] == 3

    def test_sorts_numerically_or_lexically_in_either_direction(self):
        assert execute_logic_computation("listSortNode", {"list": [3, 1, 2]}, {"numeric": True})["out"] == [1, 2, 3]
        assert execute_logic_computation(
            "listSortNode", {"list": [3, 1, 2]}, {"numeric": True, "direction": "desc"}
        )["out"] == [3, 2, 1]
        assert execute_logic_computation("listSortNode", {"list": ["b", "a"]}, {"numeric": False})["out"] == ["a", "b"]

    def test_slices_a_sub_list(self):
        out = execute_logic_computation("listSliceNode", {"list": [1, 2, 3, 4], "start": 1, "end": 3}, {})
        assert out["out"] == [2, 3]

    def test_finds_a_value_comparing_loosely_as_text(self):
        out = execute_logic_computation("listContainsNode", {"list": [1, 2, 3], "value": "2"}, {})
        assert out["out"] is True
        assert out["index"] == 1

    def test_republishes_the_accumulated_append_buffer(self):
        out = execute_logic_computation("listAppendNode", {}, {"items": [1, 2]})
        assert out["list"] == [1, 2]
        assert out["length"] == 2


class TestNewOutputNodes:
    def test_republishes_the_accumulated_value_list(self):
        out = execute_logic_computation("valueListNode", {}, {"values": ["a", "b"]})
        assert out["list"] == ["a", "b"]
        assert out["length"] == 2

    def test_gauge_reading_is_a_clamped_percentage(self):
        assert execute_logic_computation("gaugeNode", {"value": 25}, {"min": 0, "max": 50})["percent"] == 50
        assert execute_logic_computation("gaugeNode", {"value": 999}, {"min": 0, "max": 50})["percent"] == 100
