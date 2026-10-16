"""Translation of API-layer device filters into the service's query.

The API accepts ``asset_id`` as a first-class filter on targets and on the
``GET /devices`` list endpoint. Internally, assets are stored as a tag on
devices (the UI sets them via ``setDeviceTag(id, "asset_id", assetId)``), so
``asset_id`` is folded into the ``tags`` criterion here, at the composition
boundary. Keeping the translation out of devices_manager preserves the
service-boundary rule that devices_manager has no knowledge of assets.
"""

from __future__ import annotations

from models.errors import InvalidError
from models.tags import Tags, normalize_tags

ASSET_TAG = "asset_id"
"""Device tag carrying zone membership — the one place the name is spelled."""


def parse_tags_params(raw: list[str] | None) -> Tags | None:
    """Parse ``?tags=key:value`` query params into a tags filter dict.

    Filter semantics: AND across keys, OR within values of the same key.
    Repeat the param for OR: ``?tags=asset_id:a1&tags=asset_id:a2``.
    """
    if not raw:
        return None
    result: dict[str, list[str]] = {}
    for item in raw:
        key, _, value = item.partition(":")
        if not key or not value:
            msg = "Tag filters must use key:value"
            raise InvalidError(msg)
        result.setdefault(key, []).append(value)
    try:
        return normalize_tags(result)
    except ValueError as exc:
        msg = "Invalid tag filter"
        raise InvalidError(msg) from exc


def with_asset_tag(tags: Tags | None, asset_id: str | None) -> Tags | None:
    """*tags* with *asset_id* added under ``asset_id``; *tags* as is without one.

    An ``asset_id`` already listed is not repeated, and the input is left
    untouched: the result is a new mapping.
    """
    if asset_id is None:
        return tags
    merged = {key: list(values) for key, values in (tags or {}).items()}
    linked = merged.setdefault(ASSET_TAG, [])
    if asset_id not in linked:
        linked.append(asset_id)
    return merged
