"""Revisions of the documents the API serves per driver (labels, presentation).

Computed once per driver mutation by the driver registry, which stamps them
on the driver; ``core_to_dto`` reads the stamp.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .driver.revision import DriverRevisions, get_driver_revision
from .presentation.revision import get_presentation_revision

if TYPE_CHECKING:
    from .driver import Driver


def driver_revisions(driver: Driver) -> DriverRevisions:
    """Hash the driver's documents: its attribute contract and, when it
    declares one, its presentation resolved against that contract."""
    return DriverRevisions(
        driver=get_driver_revision(driver),
        presentation=get_presentation_revision(driver),
    )


def revisions_of(driver: Driver) -> DriverRevisions:
    """The registry's stamp; a driver that never went through one is hashed."""
    return driver.revisions or driver_revisions(driver)
