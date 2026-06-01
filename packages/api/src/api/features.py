from collections.abc import Mapping
from typing import Any

from api.env import load_environ

FEATURE_FLAG_ENV_PREFIX = "GRIDONE_FEATURE_"

_TRUTHY_VALUES = frozenset({"1", "t", "true", "y", "yes", "on"})
_PREFIX_LOWER = FEATURE_FLAG_ENV_PREFIX.lower()


def _is_truthy(raw: Any) -> bool:  # noqa: ANN401
    if raw is None:
        return False
    return str(raw).strip().lower() in _TRUTHY_VALUES


def enabled_flags(environ: Mapping[str, Any] | None = None) -> list[str]:
    """Return the lowercase names of enabled feature flags.

    Scans both ``.env`` and ``os.environ`` for variables prefixed with
    ``GRIDONE_FEATURE_`` (case-insensitive). A flag is considered
    enabled when its value parses as a truthy boolean (``1``, ``true``,
    ``yes``, ``on``, ``t``, ``y`` — case-insensitive). Anything else,
    including ``false`` or an unrecognized value, is treated as disabled
    and the flag is omitted.

    The prefix is stripped and the remainder is lowercased, so
    ``GRIDONE_FEATURE_BUILDING_HOMEPAGE=true`` becomes
    ``"building_homepage"``. Results are sorted for stable output.

    Tests can pass an explicit ``environ`` mapping to bypass the default
    .env + os.environ merge.
    """
    env = environ if environ is not None else load_environ()
    return sorted(
        {
            key.lower().removeprefix(_PREFIX_LOWER)
            for key, value in env.items()
            if key.lower().startswith(_PREFIX_LOWER) and _is_truthy(value)
        }
    )
