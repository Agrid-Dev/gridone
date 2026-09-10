"""Public presentation projection, without driver transport configuration."""

from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import BaseModel, Field

from devices_manager.core.presentation.diagnostics import (
    DiagnosticCode,
    PresentationDiagnostic,
    UnavailablePresentation,
)
from devices_manager.core.presentation.models import PresentationV1
from devices_manager.core.presentation.revision import get_presentation_revision
from devices_manager.core.presentation.validation import validate_presentation

if TYPE_CHECKING:
    from collections.abc import Mapping

    from devices_manager.core.driver import Driver
    from devices_manager.core.presentation.resources import StoredResource


class PresentationReference(BaseModel):
    revision: str


class PresentationAsset(BaseModel):
    sha256: str
    media_type: str


class AvailablePresentationResponse(BaseModel):
    status: Literal["available"] = "available"
    revision: str
    document: PresentationV1
    assets: dict[str, PresentationAsset]


class UnavailablePresentationResponse(BaseModel):
    status: Literal["unavailable"] = "unavailable"
    revision: str
    diagnostics: list[PresentationDiagnostic]


PresentationResponse = Annotated[
    AvailablePresentationResponse | UnavailablePresentationResponse,
    Field(discriminator="status"),
]


def presentation_response(
    driver: "Driver", resources: "Mapping[str, StoredResource]"
) -> PresentationResponse | None:
    """Project only the validated document and its declared resource digests.

    Missing resources disable the entire presentation. Driver configuration,
    transport addresses and image bytes never enter this public projection.
    """
    revision = get_presentation_revision(driver)
    if revision is None or driver.presentation is None:
        return None
    resolved = validate_presentation(driver.presentation, driver.attributes)
    if isinstance(resolved, UnavailablePresentation):
        return UnavailablePresentationResponse(
            revision=revision, diagnostics=resolved.diagnostics
        )
    missing = [
        PresentationDiagnostic(
            code=DiagnosticCode.MISSING_ASSET,
            path=f"/assets/{asset_id}",
            message="Presentation resource is unavailable",
        )
        for asset_id in resolved.document.assets
        if asset_id not in resources
    ]
    if missing:
        return UnavailablePresentationResponse(revision=revision, diagnostics=missing)
    return AvailablePresentationResponse(
        revision=revision,
        document=resolved.document,
        assets={
            asset_id: PresentationAsset(
                sha256=resources[asset_id].sha256,
                media_type=resources[asset_id].media_type,
            )
            for asset_id in resolved.document.assets
        },
    )
