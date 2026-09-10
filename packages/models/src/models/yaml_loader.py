"""Bounded YAML loading for documents written by third parties.

``yaml.safe_load`` refuses Python-object tags and nothing else: it keeps
the last of two duplicate keys, builds shared references for aliases (a
9x9 "billion laughs" loads in half a millisecond and explodes when the
document is serialized), recurses on nesting, and yields ``nan``, dates or
bytes. Driver YAML and app manifests are uploaded by people the server has
no reason to trust, so every document goes through ``load_bounded_yaml``.

PyYAML's pipeline is Reader → Scanner → Parser (events) → Composer (nodes)
→ Constructor (Python objects). Every guard lives in the composer, while the
document is still a stream of events and no Python object exists yet: size,
depth, node count *of the expanded document*, aliases, tags and keys. The
constructor only adds the finiteness check on floats, which needs the
parsed value. The result is JSON-shaped: ``str``, ``int``, finite ``float``,
``bool``, ``None``, ``list`` and ``dict`` — with keys that are ``str`` or
``int`` (drivers map integer codes: ``mapping: {1: heat}``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Final, Protocol, cast, override

import yaml
from yaml.composer import Composer
from yaml.constructor import SafeConstructor
from yaml.events import (
    AliasEvent,
    CollectionStartEvent,
    MappingEndEvent,
    MappingStartEvent,
    NodeEvent,
    ScalarEvent,
    SequenceStartEvent,
)
from yaml.nodes import MappingNode, ScalarNode
from yaml.parser import Parser
from yaml.reader import Reader
from yaml.resolver import Resolver
from yaml.scanner import Scanner

if TYPE_CHECKING:
    from collections.abc import Callable

    from yaml.error import Mark
    from yaml.events import Event
    from yaml.nodes import Node

type YamlValue = (
    None | bool | int | float | str | list[YamlValue] | dict[str | int, YamlValue]
)
"""What ``load_bounded_yaml`` returns: JSON values, plus integer mapping keys."""

MIB: Final = 1024 * 1024

_YAML_TAG_PREFIX: Final = "tag:yaml.org,2002:"
_STR_TAG: Final = _YAML_TAG_PREFIX + "str"
_INT_TAG: Final = _YAML_TAG_PREFIX + "int"
_FLOAT_TAG: Final = _YAML_TAG_PREFIX + "float"
_MERGE_TAG: Final = _YAML_TAG_PREFIX + "merge"
_JSON_TAGS: Final = frozenset(
    _YAML_TAG_PREFIX + name
    for name in ("str", "int", "float", "bool", "null", "seq", "map")
)
"""The core tags with a JSON counterpart; every other tag is refused."""


class YamlErrorCode(StrEnum):
    TOO_LARGE = "too_large"
    TOO_DEEP = "too_deep"
    TOO_MANY_NODES = "too_many_nodes"
    ALIAS = "alias"
    DUPLICATE_KEY = "duplicate_key"
    INVALID_KEY = "invalid_key"
    CUSTOM_TAG = "custom_tag"
    NON_FINITE = "non_finite"
    SYNTAX = "syntax"


@dataclass(frozen=True)
class YamlLimits:
    max_bytes: int = 1 * MIB
    max_depth: int = 64
    max_nodes: int = 50_000
    """Counted on the expanded document: an alias is charged the size of the
    subtree it names, so a billion-laughs document overflows at the alias."""
    max_aliases: int = 2_000
    """Drivers share fragments through anchors (``definitions:`` by convention):
    the largest known driver has 400 attributes, each may alias a few. The
    expanded node count is what keeps aliases harmless; this bound is only a
    ceiling on the bookkeeping. ``0`` refuses aliases altogether."""


DEFAULT_YAML_LIMITS: Final = YamlLimits()


class BoundedYamlError(ValueError):
    """A document refused by ``load_bounded_yaml``.

    ``code`` is stable and machine-readable; ``line`` and ``column`` are
    1-based and set when the refusal has a position in the source.
    """

    def __init__(
        self, code: YamlErrorCode, message: str, mark: Mark | None = None
    ) -> None:
        self.code = code
        self.line = None if mark is None else mark.line + 1
        self.column = None if mark is None else mark.column + 1
        where = "" if mark is None else f" (line {self.line}, column {self.column})"
        super().__init__(f"{code}: {message}{where}")


def load_bounded_yaml(
    text: str,
    limits: YamlLimits = DEFAULT_YAML_LIMITS,
    *,
    c_parser: bool | None = None,
) -> YamlValue:
    """Parse one YAML document into JSON-shaped values within ``limits``.

    ``c_parser`` selects the scanner and parser: ``None`` uses libyaml when
    PyYAML was built with it (the production case; 6-60x faster on hostile
    input), ``True`` requires it, ``False`` forces the pure-Python one. The
    composer, where the guards live, is the same Python class either way.
    Raises ``BoundedYamlError`` on any refusal, including syntax errors.
    """
    _check_size(text, limits)
    loader: _Loader | None = None
    try:
        # The pure-Python reader refuses control characters in its
        # constructor, so the loader is built inside the try as well.
        loader = _make_loader(text, limits, c_parser=c_parser)
        node = loader.get_single_node()
        return None if node is None else loader.construct_document(node)
    except yaml.YAMLError as exc:
        raise _syntax_error(exc) from exc
    finally:
        if loader is not None:
            loader.dispose()


def _check_size(text: str, limits: YamlLimits) -> None:
    """Refuse oversized or non-encodable text before the parser sees it.

    ``len(text)`` is a lower bound of the UTF-8 size, so the cheap check
    comes first.
    """
    if len(text) > limits.max_bytes:
        raise BoundedYamlError(
            YamlErrorCode.TOO_LARGE, f"document exceeds {limits.max_bytes} bytes"
        )
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError as exc:
        raise BoundedYamlError(
            YamlErrorCode.SYNTAX, "document is not valid Unicode text"
        ) from exc
    if size > limits.max_bytes:
        raise BoundedYamlError(
            YamlErrorCode.TOO_LARGE, f"document exceeds {limits.max_bytes} bytes"
        )


def _syntax_error(exc: yaml.YAMLError) -> BoundedYamlError:
    """PyYAML's own refusals (scanner, parser, second document) as ``syntax``."""
    if isinstance(exc, yaml.MarkedYAMLError):
        message = ", ".join(str(part) for part in (exc.context, exc.problem) if part)
        return BoundedYamlError(
            YamlErrorCode.SYNTAX, message, exc.problem_mark or exc.context_mark
        )
    return BoundedYamlError(YamlErrorCode.SYNTAX, str(exc))


# --- Composer with guards --------------------------------------------------


class BoundedComposer(Composer):
    """A composer that bounds depth, expanded node count and aliases, and
    restricts tags and mapping keys, while the document is still events."""

    # Provided by the parser (``Parser`` or ``CParser``) and the ``Resolver``
    # that the loader classes mix in with this composer.
    check_event: Callable[..., bool]
    peek_event: Callable[[], Event]
    get_event: Callable[[], Event]
    descend_resolver: Callable[[Node | None, Node | None], None]
    ascend_resolver: Callable[[], None]
    resolve: Callable[..., str]

    def __init__(self, limits: YamlLimits) -> None:
        Composer.__init__(self)
        self._limits = limits
        self._depth = 0
        self._nodes = 0
        self._aliases = 0
        self._subtree_sizes: dict[int, int] = {}
        """``id(anchored node)`` → number of nodes in its subtree."""
        self._subtree_depths: dict[int, int] = {}
        self._branch_depths: list[int] = []
        """Expanded subtree depth of each node currently being composed."""
        self._open_anchors: set[str] = set()
        """Anchors whose node is still being composed (an alias to one recurses)."""

    def compose_node(self, parent: Node | None, index: Node | None) -> Node:
        if self.check_event(AliasEvent):
            return self._compose_alias(cast("AliasEvent", self.get_event()))
        # After an alias is ruled out, the parser only emits a scalar or a
        # collection start here (PyYAML's own compose_node relies on it too).
        event = cast("ScalarEvent | CollectionStartEvent", self.peek_event())
        self._check_anchor(event)
        self._check_tag(event)
        nodes_before = self._nodes
        self._enter(event.start_mark)
        if event.anchor is not None:
            self._open_anchors.add(event.anchor)
        self.descend_resolver(parent, index)
        node = self._compose(event.anchor)
        self.ascend_resolver()
        subtree_depth = self._branch_depths.pop()
        if event.anchor is not None:
            self._open_anchors.discard(event.anchor)
            self._subtree_sizes[id(node)] = self._nodes - nodes_before
            self._subtree_depths[id(node)] = subtree_depth
        self._depth -= 1
        self._include_subtree_depth(subtree_depth)
        return node

    def _compose(self, anchor: str | None) -> Node:
        """The three node kinds; the parser guarantees one of them follows."""
        if self.check_event(ScalarEvent):
            node = self.compose_scalar_node(anchor)
            self._check_scalar_tag(node)
            return node
        if self.check_event(SequenceStartEvent):
            return self.compose_sequence_node(anchor)
        return self.compose_mapping_node(anchor)

    def _compose_alias(self, event: AliasEvent) -> Node:
        if self._aliases >= self._limits.max_aliases:
            allowed = (
                "aliases are not allowed"
                if self._limits.max_aliases == 0
                else f"at most {self._limits.max_aliases} aliases are allowed"
            )
            raise BoundedYamlError(
                YamlErrorCode.ALIAS, f"*{event.anchor}: {allowed}", event.start_mark
            )
        self._aliases += 1
        node = self.anchors.get(event.anchor)
        if node is None:
            raise BoundedYamlError(
                YamlErrorCode.ALIAS,
                f"undefined alias *{event.anchor}",
                event.start_mark,
            )
        if event.anchor in self._open_anchors:
            raise BoundedYamlError(
                YamlErrorCode.ALIAS,
                f"*{event.anchor} refers to a node that contains it",
                event.start_mark,
            )
        subtree_depth = self._subtree_depths[id(node)]
        self._check_depth(self._depth + subtree_depth, event.start_mark)
        self._include_subtree_depth(subtree_depth)
        self._charge(self._subtree_sizes[id(node)], event.start_mark)
        return node

    def _include_subtree_depth(self, depth: int) -> None:
        """Propagate a completed child or alias depth to its containing node."""
        if self._branch_depths:
            self._branch_depths[-1] = max(self._branch_depths[-1], depth + 1)

    def _check_anchor(self, event: NodeEvent) -> None:
        if event.anchor is not None and event.anchor in self.anchors:
            raise BoundedYamlError(
                YamlErrorCode.ALIAS,
                f"anchor &{event.anchor} is defined twice",
                event.start_mark,
            )

    def _check_tag(self, event: ScalarEvent | CollectionStartEvent) -> None:
        """An explicit tag must be a JSON core tag (``!`` is the non-specific tag)."""
        if event.tag is not None and event.tag != "!" and event.tag not in _JSON_TAGS:
            raise BoundedYamlError(
                YamlErrorCode.CUSTOM_TAG,
                f"tag {event.tag} is not allowed",
                event.start_mark,
            )

    def _check_scalar_tag(self, node: ScalarNode) -> None:
        """Implicit resolution may yield a non-JSON tag: ``2024-01-01`` is a
        timestamp, ``=`` a value key, ``<<`` a merge key."""
        if node.tag in _JSON_TAGS:
            return
        if node.tag == _MERGE_TAG:
            raise BoundedYamlError(
                YamlErrorCode.INVALID_KEY,
                "merge keys (<<) are not allowed",
                node.start_mark,
            )
        raise BoundedYamlError(
            YamlErrorCode.CUSTOM_TAG,
            f"'{node.value}' resolves to {node.tag}, which is not a JSON type;"
            " quote it",
            node.start_mark,
        )

    def _enter(self, mark: Mark | None) -> None:
        self._depth += 1
        self._check_depth(self._depth, mark)
        self._branch_depths.append(1)
        self._charge(1, mark)

    def _check_depth(self, depth: int, mark: Mark | None) -> None:
        if depth > self._limits.max_depth:
            raise BoundedYamlError(
                YamlErrorCode.TOO_DEEP,
                f"nesting deeper than {self._limits.max_depth}",
                mark,
            )

    def _charge(self, count: int, mark: Mark | None) -> None:
        self._nodes += count
        if self._nodes > self._limits.max_nodes:
            raise BoundedYamlError(
                YamlErrorCode.TOO_MANY_NODES,
                f"more than {self._limits.max_nodes} nodes once aliases are expanded",
                mark,
            )

    def compose_mapping_node(self, anchor: str | None) -> MappingNode:
        """PyYAML's mapping composition plus the duplicate-key check."""
        start_event = cast("MappingStartEvent", self.get_event())
        tag = start_event.tag
        if tag is None or tag == "!":
            tag = self.resolve(MappingNode, None, start_event.implicit)
        node = MappingNode(
            tag, [], start_event.start_mark, None, flow_style=start_event.flow_style
        )
        if anchor is not None:
            self.anchors[anchor] = node
        seen: set[str] = set()
        while not self.check_event(MappingEndEvent):
            key = self.compose_node(node, None)
            identity = _key_identity(key)
            if identity in seen:
                raise BoundedYamlError(
                    YamlErrorCode.DUPLICATE_KEY,
                    f"duplicate key {identity!r}",
                    key.start_mark,
                )
            seen.add(identity)
            value = self.compose_node(node, key)
            node.value.append((key, value))
        end_event = self.get_event()
        node.end_mark = end_event.end_mark
        return node


_SCALAR_CONSTRUCTOR: Final = SafeConstructor()
"""Stateless use of PyYAML's own integer parsing (``0x10``, ``1_000``, ``1:30``)."""


def _key_identity(key: Node) -> str:
    """The string under which two mapping keys are the same key.

    Keys are ``str`` or ``int``; an integer is identified by its decimal
    form so that ``1``, ``0x1`` and ``"1"`` collide instead of one silently
    overwriting the other (``mapping_codec`` reads keys through ``str()``).
    Bool, null, float and collection keys have no JSON form: refused.
    """
    if isinstance(key, ScalarNode) and key.tag == _STR_TAG:
        return str(key.value)
    if isinstance(key, ScalarNode) and key.tag == _INT_TAG:
        try:
            return str(_SCALAR_CONSTRUCTOR.construct_yaml_int(key))
        except (ValueError, IndexError) as exc:
            raise _invalid_scalar(key) from exc
    kind = str(key.tag).rpartition(":")[2]
    raise BoundedYamlError(
        YamlErrorCode.INVALID_KEY,
        f"mapping keys must be strings or integers, found a {kind} key",
        key.start_mark,
    )


# --- Constructor and loaders -----------------------------------------------


def _invalid_scalar(node: Node) -> BoundedYamlError:
    """Malformed explicit scalar tags must fail like parser syntax errors."""
    kind = str(node.tag).rpartition(":")[2]
    return BoundedYamlError(
        YamlErrorCode.SYNTAX, f"invalid {kind} value", node.start_mark
    )


class _FiniteFloatConstructor(SafeConstructor):
    """``SafeConstructor`` whose floats must be finite.

    ``.inf`` and ``.nan`` are YAML spellings with no JSON counterpart, and
    ``1e999`` overflows to ``inf`` inside ``float()``; both are only visible
    once the value is built.
    """

    @override
    def construct_object(self, node: Node, deep: bool = False) -> YamlValue:
        try:
            return super().construct_object(node, deep=deep)
        except BoundedYamlError:
            raise
        except (ValueError, KeyError, IndexError) as exc:
            raise _invalid_scalar(node) from exc

    def construct_finite_float(self, node: ScalarNode) -> float:
        value = SafeConstructor.construct_yaml_float(self, node)
        if not math.isfinite(value):
            raise BoundedYamlError(
                YamlErrorCode.NON_FINITE,
                f"{node.value} is not a finite number",
                node.start_mark,
            )
        return value


_FiniteFloatConstructor.add_constructor(
    _FLOAT_TAG, _FiniteFloatConstructor.construct_finite_float
)


class _GuardedLoader(BoundedComposer, _FiniteFloatConstructor, Resolver):
    """What both loaders share; a parser is mixed in front of it (pure
    Python) or behind it (libyaml) by the concrete classes."""


class BoundedPyLoader(Reader, Scanner, Parser, _GuardedLoader):
    """Pure-Python reader, scanner and parser."""

    def __init__(self, stream: str, limits: YamlLimits) -> None:
        Reader.__init__(self, stream)
        Scanner.__init__(self)
        Parser.__init__(self)
        BoundedComposer.__init__(self, limits)
        _FiniteFloatConstructor.__init__(self)
        Resolver.__init__(self)


if yaml.__with_libyaml__:
    from yaml.cyaml import CParser

    class BoundedCLoader(_GuardedLoader, CParser):
        """libyaml scans and parses; the guarded Python composer composes.

        The composer precedes ``CParser`` in the MRO on purpose: ``CParser``
        implements ``get_single_node`` in C and never calls a Python
        ``compose_node``, so subclassing ``yaml.CSafeLoader`` and overriding
        ``compose_node`` is silently bypassed (regression test in
        ``test_yaml_loader.py``).
        """

        def __init__(self, stream: str, limits: YamlLimits) -> None:
            CParser.__init__(self, stream)
            BoundedComposer.__init__(self, limits)
            _FiniteFloatConstructor.__init__(self)
            Resolver.__init__(self)


class _Loader(Protocol):
    def get_single_node(self) -> Node | None: ...
    def construct_document(self, node: Node) -> YamlValue: ...
    def dispose(self) -> None: ...


def _make_loader(text: str, limits: YamlLimits, *, c_parser: bool | None) -> _Loader:
    if c_parser is False or (c_parser is None and not yaml.__with_libyaml__):
        return BoundedPyLoader(text, limits)
    if not yaml.__with_libyaml__:
        msg = "PyYAML was built without libyaml; the C parser is unavailable"
        raise RuntimeError(msg)
    return BoundedCLoader(text, limits)
