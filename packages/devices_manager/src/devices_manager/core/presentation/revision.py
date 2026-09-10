"""Revision of the presentation resolved against its live driver contract."""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING

from .package_install import NORMALIZER_VERSION

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver


def get_presentation_revision(driver: Driver) -> str | None:
    """Hash the envelope, attribute contracts and normalized resources.

    All attribute contracts participate, including attributes a future dialect
    might bind. Runtime values and driver metadata do not affect the token.
    """
    if driver.presentation is None:
        return None
    contracts = {}
    for name, attribute in driver.attributes.items():
        contract = attribute.model_dump(mode="json")
        contract["read_write_modes"] = sorted(contract.get("read_write_modes", []))
        contracts[name] = contract
    payload = {
        "document": driver.presentation.document,
        "attributes": contracts,
        "resources": driver.presentation_revision,
        "normalizer": NORMALIZER_VERSION,
    }
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(canonical.encode()).hexdigest()
