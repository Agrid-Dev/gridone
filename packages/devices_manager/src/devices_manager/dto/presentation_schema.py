"""Authoring metadata sourced from the same budgets as the import pipeline."""

from pydantic import BaseModel, JsonValue

from devices_manager.core.presentation.capabilities import (
    DOCUMENT_BUDGETS,
    SUPPORTED_CAPABILITIES,
    SUPPORTED_SCHEMA_VERSIONS,
    Budgets,
)
from devices_manager.core.presentation.models import PresentationV1
from devices_manager.core.presentation.package import (
    DEFAULT_PACKAGE_LIMITS,
    PackageLimits,
)
from devices_manager.core.presentation.resource import DEFAULT_IMAGE_LIMITS, ImageLimits
from models.yaml_loader import DEFAULT_YAML_LIMITS, YamlLimits


class PresentationBudgets(BaseModel):
    document: Budgets
    package: PackageLimits
    images: ImageLimits
    yaml: YamlLimits


class PresentationSchema(BaseModel):
    versions: list[int]
    capabilities: list[str]
    budgets: PresentationBudgets
    json_schema: dict[str, JsonValue]


def presentation_schema() -> PresentationSchema:
    return PresentationSchema(
        versions=sorted(SUPPORTED_SCHEMA_VERSIONS),
        capabilities=sorted(SUPPORTED_CAPABILITIES),
        budgets=PresentationBudgets(
            document=DOCUMENT_BUDGETS,
            package=DEFAULT_PACKAGE_LIMITS,
            images=DEFAULT_IMAGE_LIMITS,
            yaml=DEFAULT_YAML_LIMITS,
        ),
        json_schema=PresentationV1.model_json_schema(),
    )
