from typing import Any

from jsonschema import Draft202012Validator

from models.errors import InvalidError


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


__all__ = ["validate_config"]
