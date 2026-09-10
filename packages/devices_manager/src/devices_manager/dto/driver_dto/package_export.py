"""Restorable package serialization: normalized images under declared PNG paths."""

from collections.abc import Mapping
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import yaml

from devices_manager.core.presentation.models import PresentationV1
from devices_manager.core.presentation.resources import StoredResource

from .driver_dto import DriverSpec


def export_package(spec: DriverSpec, resources: Mapping[str, StoredResource]) -> bytes:
    """Export the whole driver, rewriting image paths to their normalized format."""
    manifest = spec.model_dump(
        mode="json", exclude={"presentation_revision", "created_at", "updated_at"}
    )
    paths = {}
    if spec.presentation is not None and resources:
        document = PresentationV1.model_validate(spec.presentation.document)
        for asset_id in document.assets:
            paths[asset_id] = f"assets/{asset_id}.png"
            document.assets[asset_id].path = paths[asset_id]
        manifest["presentation"] = document.model_dump(mode="json", exclude_none=True)
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("driver.yaml", yaml.safe_dump(manifest, sort_keys=False))
        for asset_id, resource in resources.items():
            archive.writestr(paths[asset_id], resource.data)
    return buffer.getvalue()
