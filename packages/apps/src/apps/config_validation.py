from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

from apps.errors import InvalidAppSchemaError
from models.errors import InvalidError


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
    ignores. Every constraint violation is aggregated into a single
    `InvalidError` message instead of raising on the first one.
    """
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    if errors:
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e.path) or '<root>'}: {e.message}"
            for e in errors
        )
        msg = f"Config validation failed: {detail}"
        raise InvalidError(msg)


__all__ = ["validate_config", "validate_schema"]
