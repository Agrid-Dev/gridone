from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError

from apps.errors import (
    ConfigValidationError,
    InvalidAppSchemaError,
    ValidationErrorItem,
)


def validate_schema(schema: dict[str, Any]) -> None:
    """Check that an app's declared config schema is itself a valid JSON schema.

    `Draft202012Validator(schema)` does not validate the schema, so a
    malformed one would only blow up later inside `iter_errors`. Checking it
    upfront turns that into a controlled failure attributed to the app.

    Raises:
        InvalidAppSchemaError: the schema does not conform to Draft 2020-12.
    """
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        msg = "App returned an invalid config schema"
        raise InvalidAppSchemaError(msg) from exc


def validate_config(payload: dict[str, Any], schema: dict[str, Any]) -> None:
    """Validate an app config payload against the app's declared JSON schema.

    Uses Draft 2020-12 with no format checker: `format: password` / `format:
    asset-id` are UI annotations the spec says validators must ignore, and
    the schema's root `i18n` key is an unknown keyword Draft 2020-12 also
    ignores. Every constraint violation is collected (not just the first) and
    raised as one `ConfigValidationError` in pydantic's `{loc, msg, type}`
    shape, so API clients handle a single validation-error format (AGR-993).
    """
    validator = Draft202012Validator(schema)
    errors = sorted(
        validator.iter_errors(payload),
        # Stringified segments: a raw mixed str/int path key raises TypeError
        # when compared across siblings (e.g. ("meters", 0) vs ("meters", "x")).
        key=lambda e: [str(p) for p in e.absolute_path],
    )
    if errors:
        raise ConfigValidationError([_to_error_item(e) for e in errors])


def _to_error_item(error: ValidationError) -> ValidationErrorItem:
    """Map one `jsonschema.ValidationError` onto the pydantic error shape.

    `loc` comes from `absolute_path` (keys/indices relative to the config
    object), `type` from the failing validator keyword (`required`, `type`,
    `enum`, ...). Note `required` reports at the *parent* path — the missing
    property is named in `msg`, unlike pydantic which appends it to `loc`.
    """
    return ValidationErrorItem(
        loc=tuple(error.absolute_path),
        msg=error.message,
        type=str(error.validator),
    )


__all__ = ["validate_config", "validate_schema"]
