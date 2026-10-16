"""Revision of a driver's attribute contract.

The documents the API serves per driver (labels, presentation) are derived
from the driver's attributes; devices carry this revision so that clients
cache those documents until the driver changes.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .driver import Driver


@dataclass(frozen=True)
class DriverRevisions:
    """The cache keys a device hands clients for its driver's documents.

    Hashing them walks every attribute of the driver, so the registry stamps
    them on the driver at each mutation (``Driver.revisions``) and readers
    never hash per device.
    """

    driver: str
    presentation: str | None


def attribute_contracts(driver: Driver) -> dict[str, dict[str, Any]]:
    """Every attribute of ``driver`` as a canonical JSON-ready mapping.

    Sets (``read_write_modes``) are sorted so two equal contracts always
    serialise identically.
    """
    contracts = {}
    for name, attribute in driver.attributes.items():
        contract = attribute.model_dump(mode="json")
        contract["read_write_modes"] = sorted(contract.get("read_write_modes", []))
        contracts[name] = contract
    return contracts


def canonical_digest(payload: dict[str, Any]) -> str:
    """SHA-256 of ``payload`` serialised with sorted keys and no whitespace."""
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def get_driver_revision(driver: Driver) -> str:
    """Hash of the driver's attribute contracts.

    Runtime values and driver metadata do not affect it: it moves when an
    attribute is added, removed or edited, which is exactly when the
    per-driver documents change.
    """
    return canonical_digest({"attributes": attribute_contracts(driver)})
