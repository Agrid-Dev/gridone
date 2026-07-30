"""Shared target model: a persisted device set plus one attribute.

A target is what widgets, group commands, and automations point at. It has
two levels:

- :class:`DevicesFilter` — the persisted device-set criteria. Structural
  fields only (``ids`` / ``types`` / ``tags``): runtime query helpers such as
  ``search`` or ``is_faulty`` must never be persisted, as their semantics can
  change and would silently alter every saved target.
- :class:`AttributeTarget` — the resolvable pair ``(devices, attribute)``
  that carries a data type once resolved.

Resolution happens at the composition layer (the API), never inside a
service: the attribute becomes a *filter* on the device query, and the
result reports exclusions instead of dropping devices silently.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from models.errors import InvalidError
from models.types import DataType


class DevicesFilter(BaseModel):
    """Persisted criteria selecting a set of devices.

    Fields compose by intersection: a device matches when it satisfies every
    non-``None`` field. An empty filter matches all devices.
    """

    model_config = ConfigDict(extra="forbid")

    ids: list[str] | None = None
    types: list[str] | None = None
    tags: dict[str, list[str]] | None = None


class AttributeTarget(BaseModel):
    """A device set paired with a single attribute.

    ``attribute`` is singular by contract — consumers needing several
    attributes hold a ``list[AttributeTarget]``.
    """

    model_config = ConfigDict(extra="forbid")

    devices: DevicesFilter
    attribute: str = Field(min_length=1)


@dataclass(frozen=True)
class ResolvedTarget:
    """The outcome of resolving an :class:`AttributeTarget`. Never persisted.

    ``device_ids`` matched the filter and expose the attribute;
    ``excluded_device_ids`` matched the filter but do not expose it — they
    are reported so resolution never drops devices silently.
    """

    attribute: str
    device_ids: list[str]
    data_type: DataType
    excluded_device_ids: list[str]


class AttributeCoverage(BaseModel):
    """How widely an attribute is exposed across a device set. Never persisted.

    ``len(data_types) > 1`` means the attribute cannot form a valid target
    for that device set (mixed data types).
    """

    attribute: str
    data_types: list[DataType]
    device_count: int
    writable_count: int


def unify_data_types(types: Iterable[DataType]) -> DataType:
    """Reduce the data types of a resolved device set to the single one.

    Strict for now: every device must expose the attribute with the same
    data type (no ``{int, float} -> float`` widening — widening later is
    additive, loosening now would be a one-way door). Raises
    :class:`~models.errors.InvalidError` on an empty set or on mixed types.
    """
    unique = set(types)
    if not unique:
        msg = "Cannot unify data types: no device exposes the attribute"
        raise InvalidError(msg)
    if len(unique) > 1:
        names = ", ".join(sorted(t.value for t in unique))
        msg = f"Mixed data types across the resolved device set: {names}"
        raise InvalidError(msg)
    return unique.pop()


class TargetResolver(Protocol):
    """Resolves targets into concrete device sets.

    Implemented at the composition layer: resolution is composite by nature
    (e.g. translating asset scoping into tags) and must not live inside a
    single service.
    """

    async def resolve(
        self, target: AttributeTarget, *, writable: bool = False
    ) -> ResolvedTarget:
        """Resolve *target* to device ids and the unified data type.

        With ``writable=True``, only devices exposing the attribute as
        writable belong to the resolved set (the rest are excluded).
        """
        ...

    async def list_attribute_coverage(
        self, devices: DevicesFilter
    ) -> list[AttributeCoverage]:
        """Report every attribute exposed by the device set, with coverage."""
        ...
