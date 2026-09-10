"""The bounded loader refuses the hostile battery of the security spike with
the expected code on both parsers, and agrees with ``yaml.safe_load`` on
every real driver."""

import json
import timeit
from pathlib import Path
from typing import Any

import pytest
import yaml
from yaml.cyaml import CParser, CSafeLoader

from models.yaml_loader import (
    DEFAULT_YAML_LIMITS,
    MIB,
    BoundedCLoader,
    BoundedComposer,
    BoundedYamlError,
    YamlErrorCode,
    YamlLimits,
    load_bounded_yaml,
)

PARSERS = pytest.mark.parametrize(
    "c_parser", [True, False], ids=["libyaml", "pure_python"]
)

_PACKAGES = Path(__file__).resolve().parents[3]
RAW_DRIVERS = _PACKAGES / "devices_manager/tests/integration/fixtures/raw_drivers"
# The sibling repository's drivers, when it is checked out next to this one.
SETUP_DRIVERS = _PACKAGES.parent.parent / "gridone-setup/src/services/fixtures/drivers"


def _driver_fixtures() -> list[Path]:
    paths = sorted(RAW_DRIVERS.glob("*.yaml"))
    if SETUP_DRIVERS.is_dir():
        paths.extend(sorted(SETUP_DRIVERS.glob("*.yaml")))
        paths.extend(sorted(SETUP_DRIVERS.rglob("driver.yaml")))
    return paths


def billion_laughs(levels: int = 9, fanout: int = 9) -> str:
    """``fanout ** levels`` leaves (387 million by default) in 486 bytes."""
    lines = ["a0: &a0 [lol, lol, lol, lol, lol, lol, lol, lol, lol]"]
    for i in range(1, levels):
        refs = ", ".join(f"*a{i - 1}" for _ in range(fanout))
        lines.append(f"a{i}: &a{i} [{refs}]")
    return "\n".join(lines) + "\n"


ALIASES_ALLOWED = YamlLimits(max_aliases=1000)
NO_ALIASES = YamlLimits(max_aliases=0)


def nested_lists(depth: int, leaf: str) -> list:
    value: list = [leaf]
    for _ in range(depth - 1):
        value = [value]
    return value


# (document, limits, expected code)
REFUSED: dict[str, tuple[str, YamlLimits, YamlErrorCode]] = {
    # Nothing is expanded: the alias that overflows the budget is refused.
    "billion_laughs": (
        billion_laughs(),
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.TOO_MANY_NODES,
    ),
    "billion_laughs_no_aliases": (billion_laughs(), NO_ALIASES, YamlErrorCode.ALIAS),
    "deep_nesting_10k_flow": (
        "[" * 10_000 + "]" * 10_000,
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.TOO_DEEP,
    ),
    "deep_nesting_10k_block": (
        "- " * 10_000 + "x\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.TOO_DEEP,
    ),
    "duplicate_keys": (
        "id: a\nattributes: []\nid: b\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.DUPLICATE_KEY,
    ),
    "duplicate_keys_quoted": (
        "id: a\n'id': b\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.DUPLICATE_KEY,
    ),
    "int_key_collision": (
        "mapping:\n  1: a\n  '1': b\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.DUPLICATE_KEY,
    ),
    "int_key_hex_collision": (
        "mapping:\n  0x10: a\n  16: b\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.DUPLICATE_KEY,
    ),
    "python_object_tag": (
        "id: !!python/object/apply:os.system ['echo pwned']\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.CUSTOM_TAG,
    ),
    "python_object_new_tag": (
        "!!python/object/new:subprocess.Popen [['echo', 'pwned']]\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.CUSTOM_TAG,
    ),
    "custom_tag": (
        "id: !secret db_password\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.CUSTOM_TAG,
    ),
    "binary_key": ("!!binary aGk=: 1\n", DEFAULT_YAML_LIMITS, YamlErrorCode.CUSTOM_TAG),
    "binary_value": (
        "blob: !!binary aGk=\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.CUSTOM_TAG,
    ),
    "set_value": ("s: !!set {a, b}\n", DEFAULT_YAML_LIMITS, YamlErrorCode.CUSTOM_TAG),
    "timestamp_value": (
        "since: 2024-01-01\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.CUSTOM_TAG,
    ),
    "nan_float": ("value: .NaN\n", DEFAULT_YAML_LIMITS, YamlErrorCode.NON_FINITE),
    "inf_float": ("value: -.inf\n", DEFAULT_YAML_LIMITS, YamlErrorCode.NON_FINITE),
    "float_overflow": (
        "value: 1.0e+999\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.NON_FINITE,
    ),
    "float_key": ("1.5: x\n", DEFAULT_YAML_LIMITS, YamlErrorCode.INVALID_KEY),
    "null_key": ("null: x\n", DEFAULT_YAML_LIMITS, YamlErrorCode.INVALID_KEY),
    "bool_key": ("yes: x\n", DEFAULT_YAML_LIMITS, YamlErrorCode.INVALID_KEY),
    "list_key": ("? [1, 2]\n: x\n", DEFAULT_YAML_LIMITS, YamlErrorCode.INVALID_KEY),
    "merge_key": (
        "base: &b {a: 1}\nchild:\n  <<: *b\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.INVALID_KEY,
    ),
    "merge_key_no_alias": (
        "child:\n  <<: {a: 1}\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.INVALID_KEY,
    ),
    "multiple_documents": (
        "id: a\n---\nid: b\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.SYNTAX,
    ),
    "unbalanced_flow": ("a: [1, 2\n", DEFAULT_YAML_LIMITS, YamlErrorCode.SYNTAX),
    "nul_byte": ("id: a\x00b\n", DEFAULT_YAML_LIMITS, YamlErrorCode.SYNTAX),
    "control_char": ("id: a\x01b\n", DEFAULT_YAML_LIMITS, YamlErrorCode.SYNTAX),
    "lone_surrogate": ("id: \ud800\n", DEFAULT_YAML_LIMITS, YamlErrorCode.SYNTAX),
    "too_large_1mib_plus_1": (
        "k: " + "x" * (MIB - 3) + "\n",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.TOO_LARGE,
    ),
    "many_nodes_flat_1mib": (
        "[" + "a," * (MIB // 2 - 2) + "a]",
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.TOO_MANY_NODES,
    ),
    "wide_mapping_1mib": (
        "".join(f"k{i}: 1\n" for i in range(100_000)),
        DEFAULT_YAML_LIMITS,
        YamlErrorCode.TOO_MANY_NODES,
    ),
    "recursive_alias": ("a: &x [*x]\n", ALIASES_ALLOWED, YamlErrorCode.ALIAS),
    "undefined_alias": ("a: *nope\n", ALIASES_ALLOWED, YamlErrorCode.ALIAS),
    "duplicate_anchor": ("a: &x 1\nb: &x 2\n", ALIASES_ALLOWED, YamlErrorCode.ALIAS),
    "aliases_over_budget": (
        "a: &x 1\nb: [*x, *x, *x]\n",
        YamlLimits(max_aliases=2),
        YamlErrorCode.ALIAS,
    ),
}

# Refusals that must cost nothing: the guard fires before any expensive work.
INSTANT = [
    "billion_laughs",
    "billion_laughs_no_aliases",
    "deep_nesting_10k_flow",
    "deep_nesting_10k_block",
    "duplicate_keys",
    "python_object_tag",
    "nan_float",
    "binary_key",
    "too_large_1mib_plus_1",
]

# (document, expected value)
ACCEPTED: dict[str, tuple[str, Any]] = {
    "baseline": (
        "id: x\ntransport: mqtt\nattributes: []\n",
        {"id": "x", "transport": "mqtt", "attributes": []},
    ),
    "empty_document": ("", None),
    "deep_but_legal_40": ("- " * 40 + "x\n", nested_lists(40, "x")),
    "int_keys_knx_style": (
        "codecs:\n  - mapping:\n      1: heat\n      2: cool\n      0x10: hex\n",
        {"codecs": [{"mapping": {1: "heat", 2: "cool", 16: "hex"}}]},
    ),
    "explicit_core_tags": (
        "a: !!str 1\nb: !!int '2'\nc: !!float 3\n",
        {"a": "1", "b": 2, "c": 3.0},
    ),
    "long_scalar_within_budget": (
        "k: " + "x" * (MIB // 2) + "\n",
        {"k": "x" * (MIB // 2)},
    ),
    "exactly_1mib": ("k: " + "x" * (MIB - 4) + "\n", {"k": "x" * (MIB - 4)}),
    # YAML 1.1 resolution quirks are kept on purpose (same values as safe_load).
    "yaml_1_1_quirks": ("a: yes\nb: 1_000\nc: 1:30\n", {"a": True, "b": 1000, "c": 90}),
}


class TestRefusals:
    @PARSERS
    @pytest.mark.parametrize(
        "scalar", ["!!int abc", "!!int ''", "!!bool abc", "!!float abc"]
    )
    def test_invalid_explicit_scalar_is_a_located_syntax_error(self, scalar, c_parser):
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml(f"value: {scalar}", c_parser=c_parser)
        assert info.value.code == YamlErrorCode.SYNTAX
        assert (info.value.line, info.value.column) == (1, 8)

    @PARSERS
    @pytest.mark.parametrize("scalar", ["!!int abc", "!!int ''"])
    def test_invalid_explicit_integer_key_is_a_syntax_error(self, scalar, c_parser):
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml(f"{scalar}: value", c_parser=c_parser)
        assert info.value.code == YamlErrorCode.SYNTAX
        assert (info.value.line, info.value.column) == (1, 1)

    @PARSERS
    @pytest.mark.parametrize("name", list(REFUSED))
    def test_refused_with_code(self, name, c_parser):
        document, limits, code = REFUSED[name]
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml(document, limits, c_parser=c_parser)
        assert info.value.code == code

    @PARSERS
    @pytest.mark.parametrize("name", INSTANT)
    def test_refused_instantly(self, name, c_parser):
        """Best of three runs, well under the 100 ms budget with libyaml;
        the pure-Python scanner costs about 100 ms on 10 000 nested flow
        openings, so it gets a looser bound."""
        document, limits, _ = REFUSED[name]

        def attempt() -> None:
            with pytest.raises(BoundedYamlError):
                load_bounded_yaml(document, limits, c_parser=c_parser)

        seconds = min(timeit.repeat(attempt, number=1, repeat=3))
        assert seconds < (0.1 if c_parser else 1.0)

    def test_duplicate_key_is_located(self):
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml("id: a\nattributes: []\nid: b\n")
        assert (info.value.line, info.value.column) == (3, 1)
        assert str(info.value) == "duplicate_key: duplicate key 'id' (line 3, column 1)"

    def test_size_refusal_has_no_position(self):
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml("x" * (MIB + 1))
        assert (info.value.line, info.value.column) == (None, None)
        assert str(info.value) == "too_large: document exceeds 1048576 bytes"

    def test_is_a_value_error(self):
        with pytest.raises(ValueError, match="too_many_nodes"):
            load_bounded_yaml(billion_laughs())


class TestAccepted:
    @PARSERS
    @pytest.mark.parametrize("name", list(ACCEPTED))
    def test_value(self, name, c_parser):
        document, expected = ACCEPTED[name]
        value = load_bounded_yaml(document, c_parser=c_parser)
        assert value == expected
        json.dumps(value, allow_nan=False)  # JSON-shaped, int keys included

    @PARSERS
    def test_int_keys_stay_ints(self, c_parser):
        value = load_bounded_yaml("1: a\n0x10: b\n", c_parser=c_parser)
        assert isinstance(value, dict)
        assert value == {1: "a", 16: "b"}
        assert all(type(key) is int for key in value)

    @PARSERS
    def test_aliases_within_budget_share_the_subtree(self, c_parser):
        value = load_bounded_yaml(
            "base: &b {a: 1, b: 2}\nc: *b\nd: *b\n", ALIASES_ALLOWED, c_parser=c_parser
        )
        assert isinstance(value, dict)
        assert value == {
            "base": {"a": 1, "b": 2},
            "c": {"a": 1, "b": 2},
            "d": {"a": 1, "b": 2},
        }
        assert value["c"] is value["base"]


class TestBoundaries:
    """Small limits make the exact boundary cheap to reach."""

    @PARSERS
    def test_depth(self, c_parser):
        limits = YamlLimits(max_depth=3)
        assert load_bounded_yaml("[[x]]", limits, c_parser=c_parser) == [["x"]]
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml("[[[x]]]", limits, c_parser=c_parser)
        assert info.value.code == YamlErrorCode.TOO_DEEP

    @PARSERS
    def test_aliases_count_towards_expanded_depth(self, c_parser):
        limits = YamlLimits(max_depth=4)
        document = "a: &a [x]\nb: &b [*a]\n"
        assert load_bounded_yaml(document, limits, c_parser=c_parser) == {
            "a": ["x"],
            "b": [["x"]],
        }
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml(document + "c: [*b]\n", limits, c_parser=c_parser)
        assert info.value.code == YamlErrorCode.TOO_DEEP
        assert (info.value.line, info.value.column) == (3, 5)

    @PARSERS
    def test_nodes(self, c_parser):
        limits = YamlLimits(max_nodes=5)  # the list plus four items
        assert load_bounded_yaml("[a, b, c, d]", limits, c_parser=c_parser) == list(
            "abcd"
        )
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml("[a, b, c, d, e]", limits, c_parser=c_parser)
        assert info.value.code == YamlErrorCode.TOO_MANY_NODES

    @PARSERS
    def test_nodes_count_keys_and_expanded_aliases(self, c_parser):
        limits = YamlLimits(max_nodes=7, max_aliases=10)
        # mapping + key a + [x, y] (3 nodes) = 5, then key b + alias worth 3 = 9.
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml("a: &s [x, y]\nb: *s\n", limits, c_parser=c_parser)
        assert info.value.code == YamlErrorCode.TOO_MANY_NODES
        assert load_bounded_yaml("a: &s [x, y]\n", limits, c_parser=c_parser) == {
            "a": ["x", "y"]
        }

    @PARSERS
    def test_aliases(self, c_parser):
        limits = YamlLimits(max_aliases=2)
        document = "a: &x 1\nb: [*x, *x]\n"
        assert load_bounded_yaml(document, limits, c_parser=c_parser) == {
            "a": 1,
            "b": [1, 1],
        }
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml("a: &x 1\nb: [*x, *x, *x]\n", limits, c_parser=c_parser)
        assert info.value.code == YamlErrorCode.ALIAS


class TestEquivalenceWithSafeLoad:
    @PARSERS
    @pytest.mark.parametrize("path", _driver_fixtures(), ids=lambda path: path.name)
    def test_real_driver(self, path, c_parser):
        text = path.read_text(encoding="utf-8")
        assert load_bounded_yaml(text, c_parser=c_parser) == yaml.safe_load(text)

    def test_fixtures_are_present(self):
        assert len(_driver_fixtures()) >= 6


class TestParserSelection:
    def test_naive_csafeloader_subclass_is_bypassed(self):
        """Why the composer must precede ``CParser`` in the MRO: overriding
        ``compose_node`` on ``CSafeLoader`` is never called, the C composer
        runs and the billion laughs loads."""
        calls = 0

        class Naive(CSafeLoader):
            def compose_node(self, _parent, _index) -> None:
                nonlocal calls
                calls += 1
                pytest.fail("never reached")

        yaml.load(billion_laughs(), Loader=Naive)  # noqa: S506 - the point of the test
        assert calls == 0

    def test_bounded_c_loader_composes_in_python(self):
        mro = BoundedCLoader.__mro__
        assert mro.index(BoundedComposer) < mro.index(CParser)
        with pytest.raises(BoundedYamlError) as info:
            load_bounded_yaml(billion_laughs(), c_parser=True)
        assert info.value.code == YamlErrorCode.TOO_MANY_NODES

    def test_default_is_libyaml(self):
        assert yaml.__with_libyaml__
        assert load_bounded_yaml("a: 1") == {"a": 1}

    def test_c_parser_required_but_missing(self, monkeypatch):
        monkeypatch.setattr(yaml, "__with_libyaml__", False)
        with pytest.raises(RuntimeError, match="without libyaml"):
            load_bounded_yaml("a: 1", c_parser=True)
        assert load_bounded_yaml("a: 1") == {"a": 1}  # falls back to pure Python
