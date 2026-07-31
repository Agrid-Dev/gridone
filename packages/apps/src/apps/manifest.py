"""Parsing of the app manifest — the YAML document an app sends at registration.

Beyond the identity fields already promoted onto `App` (name, api_url,
description, icon), the manifest declares what the app intends to do with
devices: `produces`, `reads` and `commands`. Gridone surfaces them so an
operator sees what an app will touch before accepting it.

Informative in v1: nothing is enforced. The target is to derive the service
account's JWT scopes from these declarations.
"""

import yaml
from pydantic import BaseModel, Field, ValidationError

# Manifest keys describing device-level intent. The rest of the manifest holds
# identity fields, which live on `App` as columns of their own.
_CAPABILITY_FIELDS = ("produces", "reads", "commands")


class AppCapabilities(BaseModel):
    """Device-level intent declared by an app's manifest."""

    # Device types the app creates; the driver details their attributes.
    produces: list[str] = Field(default_factory=list)
    # Device type -> attributes the app reads.
    reads: dict[str, list[str]] = Field(default_factory=dict)
    # Device type -> attributes the app commands.
    commands: dict[str, list[str]] = Field(default_factory=dict)


def parse_capabilities(manifest: str) -> AppCapabilities:
    """Read `produces` / `reads` / `commands` out of a YAML manifest.

    Tolerant by design: this runs while serializing stored rows, so a manifest
    that is malformed, is not a mapping, or predates these fields yields empty
    capabilities rather than raising. Only registration validates a manifest
    and reports errors to its sender.
    """
    try:
        parsed = yaml.safe_load(manifest)
    except yaml.YAMLError:
        return AppCapabilities()
    if not isinstance(parsed, dict):
        return AppCapabilities()

    # `reads:` with no children parses to None, which no field type accepts.
    declared = {
        key: value
        for key in _CAPABILITY_FIELDS
        if (value := parsed.get(key)) is not None
    }
    try:
        return AppCapabilities.model_validate(declared)
    except ValidationError:
        return AppCapabilities()


__all__ = ["AppCapabilities", "parse_capabilities"]
