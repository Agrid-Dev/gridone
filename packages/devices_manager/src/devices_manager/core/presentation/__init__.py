"""Driver-defined device presentations: the backend contract.

A driver may carry a declarative UI document — page composition, controls,
measurements and an exact graphical face — that Gridone renders with its
own engine (ADR ``docs/specs/driver-defined-device-ui.md``, vocabulary
frozen in annex B). This package owns what the backend does with it:

- ``envelope``: what is *stored* — an opaque, bounded JSON document whose
  ``schema_version`` and ``requires`` are the only fields peeked at;
- ``capabilities``: the versions, capabilities and budgets this server
  supports, in one place;
- ``models``: the v1 dialect as pydantic models, field for field the
  TypeScript contract of the UI engine;
- ``validation``: resolution of a stored document against the driver's
  attributes into an available document or a list of located diagnostics;
- ``references``: the structured references a document holds on attributes,
  followed on rename;
- ``package``, ``resource``, ``package_install``: the import path of a
  driver package — bounded ZIP reading, image sniffing and normalization,
  and the assembly of the resources to install under a content revision.

A driver without a presentation does not change; an unsupported version is
kept inert and reported; an invalid supported document is refused at import
and, should it become invalid later, reported at read time instead of
breaking the driver.
"""

from .capabilities import (
    DOCUMENT_BUDGETS,
    SUPPORTED_CAPABILITIES,
    SUPPORTED_SCHEMA_VERSIONS,
    Budgets,
)
from .diagnostics import (
    AvailablePresentation,
    DiagnosticCode,
    PresentationDiagnostic,
    PresentationStatus,
    UnavailablePresentation,
)
from .envelope import JsonObject, JsonValue, PresentationEnvelope
from .models import PresentationV1
from .package import (
    DEFAULT_PACKAGE_LIMITS,
    PackageError,
    PackageErrorCode,
    PackageFiles,
    PackageLimits,
    read_package,
    read_payload,
)
from .package_install import (
    NORMALIZER_VERSION,
    InvalidPresentationError,
    PresentationPlan,
    assemble_presentation,
)
from .references import referenced_attributes, rename_attribute
from .resource import (
    DEFAULT_IMAGE_LIMITS,
    ImageError,
    ImageErrorCode,
    ImageLimits,
    NormalizedImage,
    normalize_image,
    normalize_images,
    sniff_image,
)
from .validation import check_compatibility, check_semantics, validate_presentation

__all__ = [
    "DEFAULT_IMAGE_LIMITS",
    "DEFAULT_PACKAGE_LIMITS",
    "DOCUMENT_BUDGETS",
    "NORMALIZER_VERSION",
    "SUPPORTED_CAPABILITIES",
    "SUPPORTED_SCHEMA_VERSIONS",
    "AvailablePresentation",
    "Budgets",
    "DiagnosticCode",
    "ImageError",
    "ImageErrorCode",
    "ImageLimits",
    "InvalidPresentationError",
    "JsonObject",
    "JsonValue",
    "NormalizedImage",
    "PackageError",
    "PackageErrorCode",
    "PackageFiles",
    "PackageLimits",
    "PresentationDiagnostic",
    "PresentationEnvelope",
    "PresentationPlan",
    "PresentationStatus",
    "PresentationV1",
    "UnavailablePresentation",
    "assemble_presentation",
    "check_compatibility",
    "check_semantics",
    "normalize_image",
    "normalize_images",
    "read_package",
    "read_payload",
    "referenced_attributes",
    "rename_attribute",
    "sniff_image",
    "validate_presentation",
]
