"""Presentation metadata and write constraints an attribute driver may declare.

Value types shared by the driver-side attribute (``AttributeDriver``, where
they are authored in YAML) and the runtime attribute (``Attribute``, where
they are projected verbatim so API clients see them on the device).
"""

from __future__ import annotations

from typing import Annotated, Any, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

Text = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
"""One displayable string: stripped, never empty, at most 200 characters."""

LanguageTag = Annotated[
    str, StringConstraints(pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
]
"""A BCP 47-style tag: a lowercase 2-3 letter language, then optional subtags.

Matches ``fr``, ``en``, ``fr-CA``, ``zh-Hant``; rejects ``FR`` and ``french``.
"""

AttributeGroup = Annotated[
    str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*$", max_length=64)
]
"""snake_case key grouping related attributes together (``setpoints``, ``fan``)."""

Unit = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)
]
"""A free unit symbol (``°C``, ``%``, ``W``, ``kWh``, ``m³/h``), displayed as-is.

Deliberately a symbol and not an enum: Gridone has no unit nomenclature yet,
and inventing one here would create a second vocabulary to reconcile later.
"""


def _reject_bool(value: Any) -> Any:  # noqa: ANN401
    """``True`` is an ``int`` to Python, and pydantic would happily read a
    bound of ``true`` as ``1.0``; that is an authoring mistake, not a number."""
    if isinstance(value, bool):
        msg = "must be a number, not a boolean"
        # pydantic only turns ValueError into a ValidationError; a TypeError
        # would escape the validator as a crash.
        raise ValueError(msg)  # noqa: TRY004
    return value


Number = Annotated[
    float | int, BeforeValidator(_reject_bool), Field(allow_inf_nan=False)
]


class LocalizedText(BaseModel):
    """A text with a mandatory default and optional per-language translations."""

    model_config = ConfigDict(extra="forbid")

    default: Text
    translations: dict[LanguageTag, Text] = Field(default_factory=dict)

    def resolve(self, language: str | None) -> str:
        """Best text for ``language``: exact tag, then base language, then default.

        ``resolve("fr-CA")`` returns the ``fr-CA`` translation when present,
        else the ``fr`` one, else ``default``. ``None`` resolves to ``default``.
        """
        if language is None:
            return self.default
        exact = self.translations.get(language)
        if exact is not None:
            return exact
        base_language = language.split("-", 1)[0].lower()
        return self.translations.get(base_language, self.default)


class AttributeRef(BaseModel):
    """A bound taken from another attribute of the same driver: ``{attribute: name}``.

    The referenced attribute's *current* value is the bound at write time.
    """

    model_config = ConfigDict(extra="forbid")

    attribute: Annotated[str, Field(min_length=1)]


Bound = Number | AttributeRef
"""A constraint bound: a JSON number, or a reference to a sibling attribute."""


class WriteConstraints(BaseModel):
    """Declarative limits the service enforces on every write of a numeric attribute.

    ``minimum`` and ``maximum`` are inclusive; ``step`` is the grid, anchored
    at 0, that accepted values must sit on. Each of the three is a constant
    or a reference to a sibling attribute whose current value is read at
    write time (a device's configurable precision, its per-mode bounds). An
    empty object is rejected: declare at least one of the three.
    """

    model_config = ConfigDict(extra="forbid")

    step: Annotated[Number, Field(gt=0)] | AttributeRef | None = None
    minimum: Bound | None = None
    maximum: Bound | None = None

    @model_validator(mode="after")
    def _check_consistency(self) -> Self:
        if self.step is None and self.minimum is None and self.maximum is None:
            msg = "at least one of step, minimum or maximum must be set"
            raise ValueError(msg)
        if (
            isinstance(self.minimum, int | float)
            and isinstance(self.maximum, int | float)
            and self.minimum > self.maximum
        ):
            msg = f"minimum ({self.minimum}) must not exceed maximum ({self.maximum})"
            raise ValueError(msg)
        return self

    def bound_refs(self) -> dict[str, AttributeRef]:
        """The step and bounds given as attribute references, keyed by field name."""
        return {
            name: bound
            for name, bound in (
                ("step", self.step),
                ("minimum", self.minimum),
                ("maximum", self.maximum),
            )
            if isinstance(bound, AttributeRef)
        }

    def references(self, attribute_name: str) -> bool:
        """Whether the step or one of the bounds is taken from ``attribute_name``."""
        return any(
            ref.attribute == attribute_name for ref in self.bound_refs().values()
        )

    def with_reference_renamed(self, old_name: str, new_name: str) -> Self:
        """Copy where every reference to ``old_name`` now names ``new_name``."""

        def follow(bound: Bound | None) -> Bound | None:
            if isinstance(bound, AttributeRef) and bound.attribute == old_name:
                return AttributeRef(attribute=new_name)
            return bound

        return self.model_copy(
            update={
                "step": follow(self.step),
                "minimum": follow(self.minimum),
                "maximum": follow(self.maximum),
            }
        )
