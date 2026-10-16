"""Revision of the presentation resolved against its live driver contract."""

from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.core.driver.revision import attribute_contracts, canonical_digest

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
    return canonical_digest(
        {
            "document": driver.presentation.document,
            "attributes": attribute_contracts(driver),
            "resources": driver.presentation_revision,
            "normalizer": NORMALIZER_VERSION,
        }
    )
