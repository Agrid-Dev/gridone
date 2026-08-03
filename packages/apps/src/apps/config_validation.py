from collections.abc import Iterator
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError
from referencing.exceptions import Unresolvable

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
    ignores. Every constraint violation is collected (not just the first) and
    raised as one `ConfigValidationError` in pydantic's `{loc, msg, type}`
    shape, so API clients handle a single validation-error format (AGR-993).

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
    except Unresolvable as exc:
        # `check_schema` cannot vet references, so a dangling `$ref` the
        # ref walk missed (e.g. behind a `$anchor`) surfaces here.
        raise InvalidAppSchemaError(_INVALID_SCHEMA_MSG) from exc
    if errors:
        raise ConfigValidationError([_to_error_item(e) for e in errors])


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


def _to_error_item(error: ValidationError) -> ValidationErrorItem:
    """Map one `jsonschema.ValidationError` onto the pydantic error shape.

    `loc` comes from `absolute_path` (keys/indices relative to the config
    object), `type` from the failing validator keyword (`type`, `enum`, ...).
    jsonschema reports `required` at the *parent* path with the property only
    named in `msg`; pydantic appends it to `loc` with `type: "missing"`, and
    UI field mapping relies on that, so `required` errors are rewritten to
    the pydantic convention.
    """
    loc = tuple(error.absolute_path)
    if error.validator == "required":
        # The message names the missing key, never a submitted value — safe.
        missing = _missing_property(error)
        if missing is not None:
            return ValidationErrorItem(
                loc=(*loc, missing), msg=error.message, type="missing"
            )
    msg = _redacted_message(error) if _is_secret_node(error.schema) else error.message
    return ValidationErrorItem(loc=loc, msg=msg, type=str(error.validator))


def _is_secret_node(schema: object) -> bool:
    """A node the form dialect marks as credential-bearing: the app contract's
    `format: password` or the first-party `secret: true` marker."""
    if not isinstance(schema, dict):
        return False
    for keyword, value in schema.items():
        if keyword == "format" and value == "password":
            return True
        if keyword == "secret" and value is True:
            return True
    return False


def _redacted_message(error: ValidationError) -> str:
    """Constraint-only message for secret nodes.

    jsonschema embeds the failing instance in most messages (`"'hunter2' is
    too short"`), which would echo the credential into the 422 body, the
    rendered field error, and any log line that stringifies the exception
    (`str(ConfigValidationError)` is the documented log-facing form).
    """
    constraint = error.validator_value
    match error.validator:
        case "minLength":
            return f"must be at least {constraint} characters"
        case "maxLength":
            return f"must be at most {constraint} characters"
        case "pattern":
            return f"does not match the expected pattern {constraint!r}"
        case "type":
            return f"is not of type {constraint!r}"
        case "enum":
            return "is not one of the allowed values"
        case _:
            return f"does not satisfy the '{error.validator}' constraint"


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
