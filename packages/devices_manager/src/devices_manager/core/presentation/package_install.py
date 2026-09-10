"""From the files of a package to what the registry installs.

``assemble_presentation`` takes the manifest's presentation (already parsed
into its envelope) and the other files of the archive, and yields the
resources to store — every declared asset normalized — under a revision
that names this exact content. It refuses, with located diagnostics, a
supported document that does not validate, a declared asset the archive
lacks and a file no asset declares (ADR §7: "un chemin vers une ressource
absente du paquet est une erreur"). What it does *not* do is resolve the
document against the driver's attributes: the registry does that on
install, as it does on every later change of the driver.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Final

from pydantic import ValidationError

from models.errors import InvalidError

from .diagnostics import DiagnosticCode, PresentationDiagnostic
from .models import PresentationV1
from .resource import DEFAULT_IMAGE_LIMITS, normalize_images
from .validation import check_compatibility, diagnostics_of

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from .envelope import PresentationEnvelope
    from .resource import ImageLimits, NormalizedImage

NORMALIZER_VERSION: Final = 1
"""Bump when ``normalize_image`` changes its output for the same input, so
the revision of an unchanged package changes with it."""


class InvalidPresentationError(InvalidError):
    """The package's presentation cannot be installed; ``diagnostics`` say
    why, each located by a JSON pointer into the document when it has one."""

    def __init__(self, diagnostics: Sequence[PresentationDiagnostic]) -> None:
        self.diagnostics = list(diagnostics)
        summary = "; ".join(
            f"[{diagnostic.code}] {diagnostic.path or '/'}: {diagnostic.message}"
            for diagnostic in self.diagnostics
        )
        super().__init__(f"presentation refused: {summary}")


@dataclass(frozen=True)
class PresentationPlan:
    resources: dict[str, NormalizedImage]
    """Normalized images by asset id."""
    revision: str
    """Hex SHA-256 of the document, the resources and the normalizer version."""
    diagnostics: list[PresentationDiagnostic]
    """Why a kept document is inert: unsupported version or capability."""


def assemble_presentation(
    envelope: PresentationEnvelope | None,
    files: Mapping[str, bytes],
    limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
) -> PresentationPlan:
    """Resources and revision of a package, or an ``InvalidPresentationError``.

    No presentation, or one whose version this server does not read: kept
    as is, and the archive may carry nothing else — its files could not be
    matched to assets. A supported version must validate structurally;
    then every declared asset must be in the archive and every file of the
    archive declared, and the images go through the per-package budget.
    """
    if envelope is None or not envelope.is_version_supported:
        _check_files(declared={}, files=files)
        diagnostics = [] if envelope is None else check_compatibility(envelope)
        return PresentationPlan({}, _revision(envelope, {}), diagnostics)
    document = _validated(envelope)
    declared = {asset_id: asset.path for asset_id, asset in document.assets.items()}
    _check_files(declared, files)
    normalized = normalize_images(
        {path: files[path] for path in set(declared.values())}, limits
    )
    resources = {asset_id: normalized[path] for asset_id, path in declared.items()}
    return PresentationPlan(
        resources, _revision(envelope, resources), check_compatibility(envelope)
    )


def _validated(envelope: PresentationEnvelope) -> PresentationV1:
    try:
        return PresentationV1.model_validate(envelope.document)
    except ValidationError as error:
        raise InvalidPresentationError(diagnostics_of(error)) from error


def _check_files(declared: Mapping[str, str], files: Mapping[str, bytes]) -> None:
    """Every declared asset exists and every file is declared, all at once."""
    diagnostics = [
        PresentationDiagnostic(
            code=DiagnosticCode.MISSING_ASSET,
            path=f"/assets/{asset_id}/path",
            message=f"'{path}' is not in the package",
        )
        for asset_id, path in declared.items()
        if path not in files
    ]
    declared_paths = set(declared.values())
    diagnostics.extend(
        PresentationDiagnostic(
            code=DiagnosticCode.UNDECLARED_FILE,
            path=None,
            message=f"'{path}' is not declared by any asset",
        )
        for path in sorted(files)
        if path not in declared_paths
    )
    if diagnostics:
        raise InvalidPresentationError(diagnostics)


def _revision(
    envelope: PresentationEnvelope | None, resources: Mapping[str, NormalizedImage]
) -> str:
    """Content address of what will be served: canonical JSON of the
    document, the sorted ``(asset id, sha256)`` pairs and the normalizer
    version, hashed with SHA-256."""
    payload = {
        "normalizer": NORMALIZER_VERSION,
        "presentation": None if envelope is None else envelope.document,
        "resources": sorted(
            (asset_id, image.sha256) for asset_id, image in resources.items()
        ),
    }
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
