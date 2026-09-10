"""Translation of API-layer device filters into ``DM.list_devices`` kwargs.

The API accepts ``asset_id`` as a first-class filter on targets and on the
``GET /devices`` list endpoint. Internally, assets are stored as a tag on
devices (the UI sets them via ``setDeviceTag(id, "asset_id", assetId)``), so
``asset_id`` is translated into a ``tags["asset_id"]`` entry here, at the
composition boundary. Keeping the translation out of devices_manager
preserves the service-boundary rule that devices_manager has no knowledge of
assets.
"""

from __future__ import annotations

from typing import Any

ASSET_TAG = "asset_id"
"""Device tag carrying zone membership — the one place the name is spelled."""


def parse_tags_params(raw: list[str] | None) -> dict[str, list[str]] | None:
    """Parse ``?tags=key:value`` query params into a tags filter dict.

    Filter semantics: AND across keys, OR within values of the same key.
    Repeat the param for OR: ``?tags=asset_id:a1&tags=asset_id:a2``.
    """
    if not raw:
        return None
    result: dict[str, list[str]] = {}
    for item in raw:
        key, _, value = item.partition(":")
        if value:
            result.setdefault(key, []).append(value)
    return result or None


def to_list_devices_kwargs(filter_dict: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of *filter_dict* with ``asset_id`` merged into ``tags``.

    Any other key is forwarded unchanged. Existing tags under ``asset_id``
    are preserved (the new value is appended rather than replacing).
    """
    kwargs = dict(filter_dict)
    asset_id = kwargs.pop(ASSET_TAG, None)
    if asset_id is not None:
        tags = dict(kwargs.get("tags") or {})
        existing = list(tags.get(ASSET_TAG) or [])
        if asset_id not in existing:
            existing.append(asset_id)
        tags[ASSET_TAG] = existing
        kwargs["tags"] = tags
    return kwargs
