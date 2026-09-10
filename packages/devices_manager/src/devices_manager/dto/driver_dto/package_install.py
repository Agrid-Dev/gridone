"""A driver package, from its files to what the service installs.

The wire shape of the manifest (``DriverSpec``) belongs to this layer, the
presentation's assembly to ``core.presentation.package_install``; this
module joins the two so a caller — the package route, the CLI's
``gridone drivers validate`` — deals with one function and one plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from pydantic import ValidationError

from devices_manager.core.presentation.package_install import assemble_presentation
from devices_manager.core.presentation.resource import DEFAULT_IMAGE_LIMITS
from models.errors import SchemaValidationError, validation_error_items
from models.yaml_loader import BoundedYamlError, load_bounded_yaml

from .driver_dto import DriverSpec
from .package_errors import import_error

if TYPE_CHECKING:
    from devices_manager.core.presentation import PresentationDiagnostic
    from devices_manager.core.presentation.package import PackageFiles
    from devices_manager.core.presentation.resource import ImageLimits, NormalizedImage


@dataclass(frozen=True)
class PackagePlan:
    spec: DriverSpec
    resources: dict[str, NormalizedImage]
    """Normalized images by asset id."""
    revision: str
    diagnostics: list[PresentationDiagnostic]
    """Why a kept presentation is inert: unsupported version or capability."""


def assemble_package(
    files: PackageFiles, limits: ImageLimits = DEFAULT_IMAGE_LIMITS
) -> PackagePlan:
    """Parse the manifest and assemble its presentation.

    Raises ``InvalidError`` subclasses only: the bounded loader's refusals
    (``InvalidError``), the driver's field errors (``SchemaValidationError``
    with pydantic's ``loc`` paths), the presentation's located diagnostics
    (``InvalidPresentationError``) and the images' refusals (``ImageError``).
    """
    spec = _parse_manifest(files.manifest)
    plan = assemble_presentation(spec.presentation, files.files, limits)
    return PackagePlan(spec, plan.resources, plan.revision, plan.diagnostics)


def _parse_manifest(manifest: str) -> DriverSpec:
    try:
        return DriverSpec.model_validate(load_bounded_yaml(manifest))
    except BoundedYamlError as error:
        raise import_error(error) from error
    except ValidationError as error:
        raise SchemaValidationError(
            validation_error_items(error), summary_prefix="driver.yaml: "
        ) from error
