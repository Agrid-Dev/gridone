import re
from collections.abc import Collection, Iterator
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError
from referencing import Registry
from referencing.exceptions import Unresolvable
from referencing.jsonschema import DRAFT202012

from apps.errors import (
    ConfigValidationError,
    InvalidAppSchemaError,
    ValidationErrorItem,
)

_INVALID_SCHEMA_MSG = "App returned an invalid config schema"

# Keywords whose values are data, not subschemas: a `$ref`-looking dict inside
# them is content, so the ref walk must not descend. A ref it consequently
# misses only defers detection to the guarded `iter_errors` in
# `validate_config`.
_NON_SCHEMA_KEYWORDS = frozenset({"const", "enum", "default", "examples", "i18n"})

# A location in the config, as jsonschema reports it: object keys and array
# indices, e.g. `("logos", 1)`.
type _Path = tuple[str | int, ...]
# A value of the config payload, as parsed from JSON.
type _Json = None | bool | int | float | str | list[_Json] | dict[str, _Json]
# A schema node with the `referencing` resolver its `$ref`s resolve against
# (the resolver type is not public).
type _ScopedNode = tuple[Any, Any]

# Value-free message of an error on a redacted branch, by failing keyword;
# `constraint` is the keyword's value. Other keywords get a generic message.
_REDACTED_MESSAGES = {
    "minLength": "must be at least {constraint} characters",
    "maxLength": "must be at most {constraint} characters",
    "pattern": "does not match the expected pattern {constraint!r}",
    "type": "is not of type {constraint!r}",
    "enum": "is not one of the allowed values",
    "anyOf": "is not valid under any of the given schemas",
    "oneOf": "is not valid under any of the given schemas",
    "uniqueItems": "has non-unique elements",
    "minItems": "must have at least {constraint} items",
    "maxItems": "must have at most {constraint} items",
    "minProperties": "must have at least {constraint} properties",
    "maxProperties": "must have at most {constraint} properties",
}


def validate_schema(schema: dict[str, Any]) -> None:
    """Check that an app's declared config schema is itself a valid JSON schema.

    `Draft202012Validator(schema)` does not validate the schema, so a
    malformed one would only blow up later inside `iter_errors`. Checking it
    upfront turns that into a controlled failure attributed to the app.
    `check_schema` does not resolve references either, so `$ref`s are vetted
    separately: remote ones are rejected (never fetched) and local pointers
    must resolve.

    Raises:
        InvalidAppSchemaError: the schema does not conform to Draft 2020-12,
            or carries a remote or dangling `$ref`.
    """
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise InvalidAppSchemaError(_INVALID_SCHEMA_MSG) from exc
    _validate_refs(schema)


def validate_config(payload: dict[str, Any], schema: dict[str, Any]) -> None:
    """Validate an app config payload against the app's declared JSON schema.

    Uses Draft 2020-12 with no format checker: `format: password` / `format:
    asset-id` are UI annotations the spec says validators must ignore, and
    the schema's root `i18n` key is an unknown keyword Draft 2020-12 also
    ignores. `contentEncoding` / `contentMediaType` are annotations too: an
    image field is held to its `maxLength`, never decoded here. Every
    constraint violation is collected (not just the first) and
    raised as one `ConfigValidationError` in pydantic's `{loc, msg, type}`
    shape, so API clients handle a single validation-error format (AGR-993).
    No message echoes a secret or encoded value (see `_redacted_paths`).

    Raises:
        ConfigValidationError: the payload violates the schema.
        InvalidAppSchemaError: the schema carries a `$ref` that cannot be
            resolved (backstop for callers that skipped `validate_schema`).
    """
    validator = Draft202012Validator(schema)
    try:
        errors = sorted(
            validator.iter_errors(payload),
            # Stringified segments: a raw mixed str/int path key raises TypeError
            # when compared across siblings (e.g. ("meters", 0) vs ("meters", "x")).
            key=lambda e: [str(p) for p in e.absolute_path],
        )
        # Walked only when there is something to report.
        redacted = _redacted_paths(schema, payload) if errors else []
    except Unresolvable as exc:
        # `check_schema` cannot vet references, so a dangling `$ref` the
        # ref walk missed (e.g. behind a `$anchor`) surfaces here — from
        # validation, or from the redaction walk, which also follows the
        # branches validation skipped.
        raise InvalidAppSchemaError(_INVALID_SCHEMA_MSG) from exc
    if errors:
        raise ConfigValidationError([_to_error_item(e, redacted) for e in errors])


def _validate_refs(schema: dict[str, Any]) -> None:
    """Reject `$ref`s that would explode later inside `iter_errors`.

    Remote references are never fetched, so they can only fail at validation
    time; local JSON pointers must point at an existing node.

    Raises:
        InvalidAppSchemaError: a `$ref` is remote or does not resolve.
    """
    for ref in _iter_refs(schema):
        if not ref.startswith("#") or not _resolves_locally(schema, ref):
            raise InvalidAppSchemaError(_INVALID_SCHEMA_MSG)


def _iter_refs(node: object) -> Iterator[str]:
    """Yield every `$ref` string found in schema positions of the tree.

    E.g. `{"properties": {"x": {"$ref": "#/$defs/Point"}}}` yields
    `"#/$defs/Point"`. Values of `_NON_SCHEMA_KEYWORDS` are not descended
    into — they hold data, not subschemas.
    """
    if isinstance(node, dict):
        for keyword, value in node.items():
            if keyword == "$ref" and isinstance(value, str):
                yield value
            elif keyword not in _NON_SCHEMA_KEYWORDS:
                yield from _iter_refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_refs(item)


def _resolves_locally(schema: dict[str, Any], ref: str) -> bool:
    """Walk a local JSON-pointer `$ref` and report whether it lands on a node.

    `#/$defs/Point` walks `schema["$defs"]["Point"]`; `~1`/`~0` decode to
    `/`/`~` per RFC 6901. Non-pointer fragments (`#anchor`) are not walked
    and pass — anchor misses are caught by the `iter_errors` backstop.
    """
    node: object = schema
    pointer = ref.removeprefix("#")
    segments = pointer.split("/")[1:] if pointer.startswith("/") else []
    for raw_segment in segments:
        segment = raw_segment.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict) and segment in node:
            node = node[segment]
        elif isinstance(node, list) and segment.isdigit() and int(segment) < len(node):
            node = node[int(segment)]
        else:
            return False
    return True


def _to_error_item(
    error: ValidationError, redacted_paths: Collection[_Path] = ()
) -> ValidationErrorItem:
    """Map one `jsonschema.ValidationError` onto the pydantic error shape.

    `loc` comes from `absolute_path` (keys/indices relative to the config
    object), `type` from the failing validator keyword (`type`, `enum`, ...).
    jsonschema reports `required` at the *parent* path with the property only
    named in `msg`; pydantic appends it to `loc` with `type: "missing"`, and
    UI field mapping relies on that, so `required` errors are rewritten to
    the pydantic convention. Any other error on a redacted branch
    (`_on_redacted_branch`) gets a value-free message.
    """
    loc = tuple(error.absolute_path)
    if error.validator == "required":
        # The message names the missing key, never a submitted value — safe.
        missing = _missing_property(error)
        if missing is not None:
            return ValidationErrorItem(
                loc=(*loc, missing), msg=error.message, type="missing"
            )
    msg = (
        _redacted_message(error)
        if _on_redacted_branch(loc, redacted_paths)
        else error.message
    )
    return ValidationErrorItem(loc=loc, msg=msg, type=str(error.validator))


def _on_redacted_branch(loc: _Path, redacted_paths: Collection[_Path]) -> bool:
    """Whether the value at `loc` holds, or lies within, a redacted value.

    jsonschema's messages embed the failing instance, which is the whole value
    at `loc`: an error at `("logos",)` (e.g. `uniqueItems`) echoes every
    image of the list. So an error is redacted when a redacted path starts
    with its `loc` — `("logos", 1)`, or any path for a root error — and when
    its `loc` starts with one, e.g. a field inside a `secret: true` object.
    """
    return any(
        loc[: len(path)] == path or path[: len(loc)] == loc for path in redacted_paths
    )


def _redacted_paths(schema: dict[str, Any], payload: _Json) -> list[_Path]:
    """Every location of `payload` whose value must never be echoed.

    Walks the payload together with every schema node that may apply at each
    location, and records a location as soon as one of them is a redacted
    node (`_is_redacted_node`): its whole value is then redacted, so the walk
    stops there. E.g. `{"properties": {"logo": {"anyOf": [{"type": "string",
    "contentEncoding": "base64"}, {"type": "null"}]}}}` with `{"logo":
    "iVBOR..."}` yields `[("logo",)]`.

    Over-approximates on purpose, since it only decides which messages go
    value-free: every branch of `allOf`/`anyOf`/`oneOf`/`if`/`then`/`else`/
    `not`/`dependentSchemas` counts whether or not the value matches it, and
    `$ref`/`$dynamicRef` targets count alongside their sibling keywords (a
    `$ref` to an image with a sibling `maxLength`). A reference that does not
    resolve raises `Unresolvable`, which `validate_config` maps to the app's
    fault like a dangling reference met during validation.
    """
    root = Registry().resolver_with_root(DRAFT202012.create_resource(schema))
    found: list[_Path] = []
    _collect_redacted_paths([(schema, root)], payload, (), found)
    return found


def _collect_redacted_paths(
    nodes: list[_ScopedNode], instance: _Json, path: _Path, found: list[_Path]
) -> None:
    """Recursive step of `_redacted_paths` at one location of the payload."""
    applicable = _applicable_nodes(nodes)
    if not applicable:
        # No schema reaches this value, nor anything below it.
        return
    if any(_is_redacted_node(node) for node, _ in applicable):
        found.append(path)
        return
    if isinstance(instance, dict):
        for key, value in instance.items():
            children = [
                (child, resolver)
                for node, resolver in applicable
                for child in _property_subschemas(node, key)
            ]
            _collect_redacted_paths(children, value, (*path, key), found)
    elif isinstance(instance, list):
        for index, item in enumerate(instance):
            children = [
                (child, resolver)
                for node, resolver in applicable
                for child in _item_subschemas(node, index)
            ]
            _collect_redacted_paths(children, item, (*path, index), found)


def _applicable_nodes(nodes: list[_ScopedNode]) -> list[_ScopedNode]:
    """`nodes` plus every node they apply to the same value, transitively.

    That is what `$ref`/`$dynamicRef` point at (jsonschema resolves a
    `$dynamicRef` statically too), the branches of `allOf`/`anyOf`/`oneOf`,
    `not`, `if`/`then`/`else`, and `dependentSchemas`. Boolean schemas carry
    no keyword and are dropped; a node already met is skipped, which ends
    `$ref` cycles.

    Raises:
        Unresolvable: a `$ref` does not resolve.
    """
    applicable: list[_ScopedNode] = []
    seen: set[int] = set()
    pending = list(nodes)
    while pending:
        node, resolver = pending.pop()
        if not isinstance(node, dict) or id(node) in seen:
            continue
        seen.add(id(node))
        # A node with an `$id` rebases the references below it.
        resolver = resolver.in_subresource(DRAFT202012.create_resource(node))
        applicable.append((node, resolver))
        for keyword in ("$ref", "$dynamicRef"):
            ref = node.get(keyword)
            if isinstance(ref, str):
                resolved = resolver.lookup(ref)
                pending.append((resolved.contents, resolved.resolver))
        for keyword in ("allOf", "anyOf", "oneOf"):
            branches = node.get(keyword)
            if isinstance(branches, list):
                pending.extend((branch, resolver) for branch in branches)
        pending.extend(
            (node[keyword], resolver)
            for keyword in ("not", "if", "then", "else")
            if keyword in node
        )
        dependent = node.get("dependentSchemas")
        if isinstance(dependent, dict):
            pending.extend((subschema, resolver) for subschema in dependent.values())
    return applicable


def _property_subschemas(node: dict[str, Any], key: str) -> list[Any]:
    """The subschemas `node` applies to the value of property `key`.

    `properties[key]`, every `patternProperties` entry whose regex matches the
    key (searched, as jsonschema does), `additionalProperties` when neither
    names it, and `unevaluatedProperties` in any case.
    """
    subschemas: list[Any] = []
    properties = node.get("properties")
    if isinstance(properties, dict) and key in properties:
        subschemas.append(properties[key])
    patterns = node.get("patternProperties")
    if isinstance(patterns, dict):
        subschemas.extend(
            subschema
            for pattern, subschema in patterns.items()
            if re.search(pattern, key)
        )
    # Nothing so far means neither `properties` nor a pattern names the key.
    if not subschemas and "additionalProperties" in node:
        subschemas.append(node["additionalProperties"])
    if "unevaluatedProperties" in node:
        subschemas.append(node["unevaluatedProperties"])
    return subschemas


def _item_subschemas(node: dict[str, Any], index: int) -> list[Any]:
    """The subschemas `node` applies to the array item at `index`.

    `prefixItems[index]`, or `items` past the prefix; plus `contains` and
    `unevaluatedItems` in any case.
    """
    subschemas: list[Any] = []
    prefix = node.get("prefixItems")
    if isinstance(prefix, list) and index < len(prefix):
        subschemas.append(prefix[index])
    elif "items" in node:
        subschemas.append(node["items"])
    subschemas.extend(
        node[keyword] for keyword in ("contains", "unevaluatedItems") if keyword in node
    )
    return subschemas


def _is_redacted_node(schema: object) -> bool:
    """A node whose submitted value must never be echoed in an error message.

    Either credential-bearing, as the form dialect marks it (the app
    contract's `format: password`, the first-party `secret: true` marker), or
    encoded content (`contentEncoding`, e.g. a base64 image), whose value can
    weigh hundreds of kilobytes.
    """
    if not isinstance(schema, dict):
        return False
    for keyword, value in schema.items():
        if keyword == "format" and value == "password":
            return True
        if keyword == "secret" and value is True:
            return True
        if keyword == "contentEncoding":
            return True
    return False


def _redacted_message(error: ValidationError) -> str:
    """Constraint-only message for an error on a redacted branch.

    jsonschema embeds the failing instance in most messages (`"'hunter2' is
    too short"`, `"['iVBOR...', 'iVBOR...'] has non-unique elements"`), which
    would echo the credential — or a whole base64 file — into the 422 body,
    the rendered field error, and any log line that stringifies the exception
    (`str(ConfigValidationError)` is the documented log-facing form).
    """
    if error.validator == "oneOf" and not error.context:
        # No sub-errors: several branches matched, rather than none.
        return "is valid under more than one of the given schemas"
    template = _REDACTED_MESSAGES.get(
        str(error.validator), "does not satisfy the '{validator}' constraint"
    )
    return template.format(constraint=error.validator_value, validator=error.validator)


def _missing_property(error: ValidationError) -> str | None:
    """Recover which property a `required` error is about.

    jsonschema emits one error per missing property but only names it in the
    message (`"'api_key' is a required property"`). Match that message against
    each required-but-absent candidate; `None` if the wording ever changes
    (the caller then falls back to the parent `loc`).
    """
    if not isinstance(error.instance, dict) or not isinstance(
        error.validator_value, list
    ):
        return None
    for prop in error.validator_value:
        if prop not in error.instance and error.message == (
            f"{prop!r} is a required property"
        ):
            return prop
    return None


__all__ = ["validate_config", "validate_schema"]
