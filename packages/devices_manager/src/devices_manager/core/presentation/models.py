"""The v1 dialect of driver-defined presentations (annex B §2), as data.

Field for field the TypeScript contract of the UI engine
(``apps/ui/src/components/device-ui/face/types.ts`` and ``conditions.ts``):
same names, same shapes, ``extra="forbid"`` everywhere. These models say what
a document may *contain*; what it may *reference* (attributes, declared ids,
budgets) is the job of ``validation.py``.
"""

import re
from enum import StrEnum
from typing import Annotated, Final, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Discriminator,
    Field,
    StrictInt,
    StringConstraints,
    Tag,
)

from devices_manager.core.driver.attribute_metadata import (
    AttributeGroup,
    LocalizedText,
    Number,
    Unit,
)


class StrictModel(BaseModel):
    """Every node of the dialect rejects unknown fields (ADR §10)."""

    model_config = ConfigDict(extra="forbid")


# --- Scalars -----------------------------------------------------------------

LocalId = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*$", max_length=64)]
"""A document-local identifier (binding, control, asset, glyph set, layer)."""

Capability = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9-]*/[0-9]+$")]
"""A capability announced in ``requires``: ``layout/1``, ``device-face/1``."""


def _lowercase(value: object) -> object:
    return value.lower() if isinstance(value, str) else value


HexColor = Annotated[
    str, BeforeValidator(_lowercase), StringConstraints(pattern=r"^#[0-9a-f]{6}$")
]
"""``#rrggbb``; uppercase input is accepted and normalised to lowercase."""

Pixels = Annotated[StrictInt, Field(ge=0)]
"""A non-negative integer length in view-box pixels."""

PositiveInt = Annotated[StrictInt, Field(gt=0)]

Char = Annotated[str, StringConstraints(min_length=1, max_length=1)]
CharPair = Annotated[str, StringConstraints(min_length=2, max_length=2)]

Scalar = str | int | float | bool
"""A condition operand or the value of a binding."""

MAX_ASSET_PATH_LENGTH: Final = 128
MAX_ASSET_PATH_SEGMENTS: Final = 4
_ASSET_PATH_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_ASSET_EXTENSIONS = (".png", ".webp")


def check_path_segments(
    path: str,
    *,
    max_length: int = MAX_ASSET_PATH_LENGTH,
    max_segments: int = MAX_ASSET_PATH_SEGMENTS,
) -> None:
    """The part of the ZIP entry rule (annex B §4) a directory shares with a file.

    Relative, ASCII, at most ``max_length`` characters and ``max_segments``
    segments, each segment starting with a letter or digit — so ``.``,
    ``..``, hidden files and ``__MACOSX`` are out, and so is an empty segment
    (``a//b``, a leading or trailing ``/``). Accepts ``assets`` and
    ``ui/atlas``; rejects ``/assets``, ``../assets``, ``a/b/c/d/e``,
    ``boîtier`` and ``assets/``.
    """
    if len(path) > max_length:
        msg = f"must be at most {max_length} characters"
        raise ValueError(msg)
    segments = path.split("/")
    if len(segments) > max_segments:
        msg = f"must have at most {max_segments} path segments"
        raise ValueError(msg)
    if not all(_ASSET_PATH_SEGMENT.fullmatch(segment) for segment in segments):
        msg = (
            "must be a relative path of ASCII letters, digits, '.', '_' and '-' "
            "segments, none starting with '.'"
        )
        raise ValueError(msg)


def check_asset_path(
    path: str,
    *,
    max_length: int = MAX_ASSET_PATH_LENGTH,
    max_segments: int = MAX_ASSET_PATH_SEGMENTS,
) -> str:
    """Enforce the ZIP entry rules of annex B §4 on an asset path.

    ``check_path_segments`` plus the extension: ``.png`` or ``.webp``.
    Accepts ``assets/case.png`` and ``ui/atlas/digits.webp``; rejects
    ``/case.png``, ``../case.png``, ``a/b/c/d/e.png``, ``case.PNG``,
    ``case.jpg`` and ``boîtier.png``. Shared with the package reader so a
    path the document accepts is a path the archive may carry.
    """
    check_path_segments(path, max_length=max_length, max_segments=max_segments)
    if not path.endswith(_ASSET_EXTENSIONS):
        msg = "must be a .png or .webp file"
        raise ValueError(msg)
    return path


AssetPath = Annotated[str, AfterValidator(check_asset_path)]


# --- Geometry ----------------------------------------------------------------


class Box(StrictModel):
    """A rectangle in view-box pixels (the device's native screen grid)."""

    x: StrictInt
    y: StrictInt
    width: Pixels
    height: Pixels


class Size(StrictModel):
    """The fixed reference surface of a face; both dimensions are positive."""

    width: PositiveInt
    height: PositiveInt


class FixedSize(StrictModel):
    """A label size imposed instead of the size of its content."""

    width: Pixels | None = None
    height: Pixels | None = None


# --- Conditions (conditions/1) -----------------------------------------------


class EqCondition(StrictModel):
    op: Literal["eq"]
    binding: LocalId
    value: Scalar


class InCondition(StrictModel):
    op: Literal["in"]
    binding: LocalId
    values: list[Scalar]


class IsKnownCondition(StrictModel):
    op: Literal["is_known"]
    binding: LocalId


class NotCondition(StrictModel):
    op: Literal["not"]
    condition: "Condition"


class AllCondition(StrictModel):
    op: Literal["all"]
    conditions: list["Condition"]


class AnyCondition(StrictModel):
    op: Literal["any"]
    conditions: list["Condition"]


Condition = Annotated[
    EqCondition
    | InCondition
    | IsKnownCondition
    | NotCondition
    | AllCondition
    | AnyCondition,
    Field(discriminator="op"),
]
"""Bounded, three-valued condition language; no expressions, no path access."""

NotCondition.model_rebuild()
AllCondition.model_rebuild()
AnyCondition.model_rebuild()

BindingCondition = EqCondition | InCondition | IsKnownCondition
"""The leaves: the conditions that read a binding."""


# --- Colours -----------------------------------------------------------------


class ColorRule(StrictModel):
    when: Condition
    color: HexColor


class ConditionalColor(StrictModel):
    """A colour that depends on device state: the first matching rule wins."""

    rules: list[ColorRule]
    default: HexColor


def _color_tag(value: object) -> str:
    return "conditional" if isinstance(value, dict | ConditionalColor) else "constant"


LayerColor = Annotated[
    Annotated[HexColor, Tag("constant")]
    | Annotated[ConditionalColor, Tag("conditional")],
    Discriminator(_color_tag),
]


# --- Text of a glyph run (glyph-text/1) ---------------------------------------


class DigitPlace(StrEnum):
    TENS = "tens"
    UNITS = "units"
    TENTHS = "tenths"


class DigitSpec(StrictModel):
    """One decimal digit of the absolute value of a bound number.

    ``chars`` maps the digits 0-9, in order, to the glyphs to use, so a glyph
    set can carry combined "dot + digit" glyphs for the tenths.
    """

    binding: LocalId
    place: DigitPlace
    chars: Annotated[str, StringConstraints(min_length=10, max_length=10)] | None = None


class NumberSpec(StrictModel):
    """A bound number formatted with a fixed number of decimals."""

    binding: LocalId
    decimals: Annotated[StrictInt, Field(ge=0, le=6)]


class SelectSpec(StrictModel):
    """A bound value mapped to text; ``default`` applies to unmapped values."""

    binding: LocalId
    cases: dict[str, str]
    default: str | None = None


class LiteralPart(StrictModel):
    literal: Annotated[str, StringConstraints(max_length=200)]


class DigitPart(StrictModel):
    digit: DigitSpec


class NumberPart(StrictModel):
    number: NumberSpec


class SelectPart(StrictModel):
    select: SelectSpec


_TEXT_PART_TAGS: Final[dict[type[StrictModel], str]] = {
    LiteralPart: "literal",
    DigitPart: "digit",
    NumberPart: "number",
    SelectPart: "select",
}


def _text_part_tag(value: object) -> str | None:
    """A text part is discriminated by its single key, like the TS union."""
    if isinstance(value, dict):
        if len(value) != 1:
            return None
        key = next(iter(value))
        return key if isinstance(key, str) else None
    return _TEXT_PART_TAGS.get(type(value))


TextPart = Annotated[
    Annotated[LiteralPart, Tag("literal")]
    | Annotated[DigitPart, Tag("digit")]
    | Annotated[NumberPart, Tag("number")]
    | Annotated[SelectPart, Tag("select")],
    Discriminator(
        _text_part_tag,
        custom_error_type="text_part",
        custom_error_message=(
            "a text part is one of {literal}, {digit}, {number} or {select}"
        ),
    ),
]


# --- Anchors -----------------------------------------------------------------


class LvAlign(StrEnum):
    """LVGL alignments: the nine inner ones plus the two outer, mid-height ones."""

    TOP_LEFT = "top-left"
    TOP_MID = "top-mid"
    TOP_RIGHT = "top-right"
    LEFT_MID = "left-mid"
    CENTER = "center"
    RIGHT_MID = "right-mid"
    BOTTOM_LEFT = "bottom-left"
    BOTTOM_MID = "bottom-mid"
    BOTTOM_RIGHT = "bottom-right"
    OUT_RIGHT_MID = "out-right-mid"
    OUT_LEFT_MID = "out-left-mid"


class _AnchorBase(StrictModel):
    align: LvAlign
    dx: StrictInt = 0
    dy: StrictInt = 0


class BoxAnchor(_AnchorBase):
    """Aligned on a fixed box."""

    box: Box


class RefAnchor(_AnchorBase):
    """Aligned on the laid-out box of an earlier layer of the same face."""

    ref: LocalId


def _anchor_tag(value: object) -> str | None:
    if isinstance(value, dict):
        return "box" if "box" in value else "ref" if "ref" in value else None
    return "box" if isinstance(value, BoxAnchor) else "ref"


Anchor = Annotated[
    Annotated[BoxAnchor, Tag("box")] | Annotated[RefAnchor, Tag("ref")],
    Discriminator(
        _anchor_tag,
        custom_error_type="anchor",
        custom_error_message="an anchor aligns on either a box or a ref",
    ),
]


# --- Face layers (device-face/1) ---------------------------------------------


class ActionOp(StrEnum):
    TOGGLE = "toggle"
    INCREMENT = "increment"
    DECREMENT = "decrement"
    CYCLE = "cycle"


class FaceAction(StrictModel):
    """An interaction on a declared control; ``op`` must suit the control's kind."""

    control: LocalId
    op: ActionOp


class _BoxedLayer(StrictModel):
    id: LocalId | None = None
    box: Box
    visible_when: Condition | None = None


class ImageLayer(_BoxedLayer):
    kind: Literal["image"]
    asset: LocalId


class RectLayer(_BoxedLayer):
    kind: Literal["rect"]
    fill: HexColor
    radius: Pixels | None = None


class GlyphLayer(_BoxedLayer):
    """One character of a glyph set stretched into a box, tinted."""

    kind: Literal["glyph"]
    glyph_set: LocalId
    char: Char
    color: LayerColor
    label: LocalizedText | None = None


class GlyphTextLayer(StrictModel):
    """A run of glyphs laid out like an LVGL label (see ``textLayout.ts``)."""

    kind: Literal["glyph-text"]
    id: LocalId | None = None
    glyph_set: LocalId
    anchor: Anchor
    text: list[TextPart]
    color: LayerColor
    size: FixedSize | None = None
    clip: Box | None = None
    visible_when: Condition | None = None
    label: LocalizedText | None = None


class ButtonLayer(_BoxedLayer):
    kind: Literal["button"]
    label: LocalizedText
    action: FaceAction
    blocked_when: Condition | None = None


FaceLayer = Annotated[
    ImageLayer | RectLayer | GlyphLayer | GlyphTextLayer | ButtonLayer,
    Field(discriminator="kind"),
]


# --- Page nodes ---------------------------------------------------------------


class StackNode(StrictModel):
    kind: Literal["stack"]
    children: list["PageNode"]


class ColumnItem(StrictModel):
    weight: PositiveInt
    content: "PageNode"


class ColumnsNode(StrictModel):
    kind: Literal["columns"]
    items: list[ColumnItem]


class SectionNode(StrictModel):
    kind: Literal["section"]
    title: LocalizedText
    description: LocalizedText | None = None
    children: list["PageNode"]


class AttributesNode(StrictModel):
    """The generic attribute panes, optionally filtered on an attribute group."""

    kind: Literal["attributes"]
    group: AttributeGroup | None = None


class ControlPanelNode(StrictModel):
    kind: Literal["control-panel"]
    controls: list[LocalId]


class Formatter(StrictModel):
    """How a measurement is displayed; every field is optional."""

    decimals: Annotated[StrictInt, Field(ge=0, le=6)] | None = None
    unit: Unit | None = None
    relative_time: bool | None = None
    unavailable: LocalizedText | None = None


class MeasurementItem(StrictModel):
    binding: LocalId
    label: LocalizedText | None = None
    formatter: Formatter | None = None


class MeasurementsNode(StrictModel):
    kind: Literal["measurements"]
    items: list[MeasurementItem]


class ControlRef(StrictModel):
    control: LocalId


class BindingRef(StrictModel):
    binding: LocalId


def _demanded_tag(value: object) -> str | None:
    if isinstance(value, dict):
        return (
            "control"
            if "control" in value
            else "binding"
            if "binding" in value
            else None
        )
    return "control" if isinstance(value, ControlRef) else "binding"


Demanded = Annotated[
    Annotated[ControlRef, Tag("control")] | Annotated[BindingRef, Tag("binding")],
    Discriminator(
        _demanded_tag,
        custom_error_type="demanded",
        custom_error_message="the demanded value is either a control or a binding",
    ),
]
"""The demanded value of a setpoint row: a control (editable) or a binding."""


class Deviation(StrictModel):
    """``minuend - subtrahend``, classified against ``tolerance``."""

    minuend: LocalId
    subtrahend: LocalId
    tolerance: Annotated[Number, Field(ge=0)]


class SetpointRow(StrictModel):
    label: LocalizedText
    demanded: Demanded
    regulated: BindingRef | None = None
    measured: BindingRef | None = None
    deviation: Deviation | None = None
    formatter: Formatter | None = None


class SetpointTableNode(StrictModel):
    kind: Literal["setpoint-table"]
    rows: list[SetpointRow]


class DeviceFaceNode(StrictModel):
    """An exact graphical surface: fixed view box, layers in paint order."""

    kind: Literal["device-face"]
    label: LocalizedText
    view_box: Size
    layers: list[FaceLayer]


PageNode = Annotated[
    StackNode
    | ColumnsNode
    | SectionNode
    | AttributesNode
    | ControlPanelNode
    | MeasurementsNode
    | SetpointTableNode
    | DeviceFaceNode,
    Field(discriminator="kind"),
]

StackNode.model_rebuild()
ColumnItem.model_rebuild()
SectionNode.model_rebuild()


# --- Root ---------------------------------------------------------------------


class AssetSpec(StrictModel):
    path: AssetPath


class GlyphCell(StrictModel):
    """A character's cell in the atlas plus its bitmap-font metrics."""

    x: Pixels
    y: Pixels
    width: Pixels
    height: Pixels
    advance: Pixels
    offset_x: StrictInt
    offset_y: StrictInt


class GlyphSet(StrictModel):
    """Per-glyph cells of an atlas asset, with the metrics needed to lay text out."""

    asset: LocalId
    line_height: PositiveInt
    base_line: Pixels
    cells: dict[Char, GlyphCell]
    kerning: dict[CharPair, StrictInt] = Field(default_factory=dict)


class BindingSpec(StrictModel):
    """A local name for an attribute of the device the page is rendered for."""

    attribute: Annotated[str, Field(min_length=1)]


class ControlKind(StrEnum):
    TOGGLE = "toggle"
    NUMBER = "number"
    SELECT = "select"


class Control(StrictModel):
    kind: ControlKind
    binding: LocalId
    label: LocalizedText


class PresentationV1(StrictModel):
    """A whole v1 presentation document."""

    schema_version: Literal[1]
    requires: list[Capability]
    assets: dict[LocalId, AssetSpec] = Field(default_factory=dict)
    glyph_sets: dict[LocalId, GlyphSet] = Field(default_factory=dict)
    bindings: dict[LocalId, BindingSpec] = Field(default_factory=dict)
    controls: dict[LocalId, Control] = Field(default_factory=dict)
    page: PageNode
