"""Resolution of a stored presentation against a driver's attributes.

Three steps, as the ADR §10 orders them: compatibility of the announced
version and capabilities, structural validation of the document, then the
semantic rules — every reference exists and every type fits. Nothing stops
at the first problem: an authoring tool gets the whole list, each entry
located by a JSON pointer into the document.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Final

from pydantic import ValidationError

from devices_manager.types import DataType

from .capabilities import (
    DOCUMENT_BUDGETS,
    SUPPORTED_CAPABILITIES,
    SUPPORTED_SCHEMA_VERSIONS,
)
from .diagnostics import (
    AvailablePresentation,
    DiagnosticCode,
    PresentationDiagnostic,
    PresentationStatus,
    UnavailablePresentation,
)
from .models import (
    ActionOp,
    AllCondition,
    AnyCondition,
    AttributesNode,
    BindingCondition,
    BindingRef,
    ButtonLayer,
    ColumnsNode,
    Condition,
    ConditionalColor,
    Control,
    ControlKind,
    ControlPanelNode,
    ControlRef,
    DeviceFaceNode,
    DigitPart,
    EqCondition,
    FaceAction,
    FaceLayer,
    GlyphLayer,
    GlyphTextLayer,
    ImageLayer,
    InCondition,
    MeasurementsNode,
    NotCondition,
    NumberPart,
    PageNode,
    PresentationV1,
    RefAnchor,
    Scalar,
    SectionNode,
    SelectPart,
    SetpointRow,
    SetpointTableNode,
    StackNode,
    TextPart,
)

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping

    from devices_manager.core.driver.attribute_driver import AttributeDriver

    from .envelope import PresentationEnvelope

_NUMERIC_DATA_TYPES: Final = frozenset({DataType.INT, DataType.FLOAT})

_ACTION_OPS_BY_CONTROL_KIND: Final[dict[ControlKind, frozenset[ActionOp]]] = {
    ControlKind.TOGGLE: frozenset({ActionOp.TOGGLE}),
    ControlKind.NUMBER: frozenset({ActionOp.INCREMENT, ActionOp.DECREMENT}),
    ControlKind.SLIDER: frozenset({ActionOp.INCREMENT, ActionOp.DECREMENT}),
    ControlKind.SELECT: frozenset({ActionOp.CYCLE}),
}

_NODE_CAPABILITIES: Final[dict[type, str]] = {
    StackNode: "layout/1",
    ColumnsNode: "layout/1",
    SectionNode: "layout/1",
    AttributesNode: "layout/1",
    ControlPanelNode: "controls/1",
    MeasurementsNode: "measurements/1",
    SetpointTableNode: "setpoint-table/1",
    DeviceFaceNode: "device-face/1",
}


# --- Entry points ------------------------------------------------------------


def validate_presentation(
    envelope: PresentationEnvelope, attributes: Mapping[str, AttributeDriver]
) -> PresentationStatus:
    """Resolve a stored presentation for a driver whose attributes are given.

    Unsupported version or capability → unavailable, nothing else is read.
    Structurally invalid document → unavailable with one diagnostic per
    pydantic error. Otherwise the semantic rules decide.
    """
    compatibility = check_compatibility(envelope)
    if compatibility:
        return UnavailablePresentation(diagnostics=compatibility)
    try:
        document = PresentationV1.model_validate(envelope.document)
    except ValidationError as error:
        return UnavailablePresentation(diagnostics=diagnostics_of(error))
    semantics = check_semantics(document, attributes)
    if semantics:
        return UnavailablePresentation(diagnostics=semantics)
    return AvailablePresentation(document=document)


def check_compatibility(envelope: PresentationEnvelope) -> list[PresentationDiagnostic]:
    """Whether this server understands the announced version and capabilities."""
    if envelope.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        return [
            PresentationDiagnostic(
                code=DiagnosticCode.UNSUPPORTED_VERSION,
                path="/schema_version",
                message=f"schema version {envelope.schema_version} is not supported",
            )
        ]
    return [
        PresentationDiagnostic(
            code=DiagnosticCode.UNSUPPORTED_CAPABILITY,
            path=f"/requires/{index}",
            message=f"capability '{capability}' is not supported",
        )
        for index, capability in enumerate(envelope.requires)
        if capability not in SUPPORTED_CAPABILITIES
    ]


def check_semantics(
    document: PresentationV1, attributes: Mapping[str, AttributeDriver]
) -> list[PresentationDiagnostic]:
    """Every reference resolves, every type fits, every budget holds."""
    scope = _Scope(document, attributes)
    report = _Report()
    _check_bindings(scope, report)
    _check_controls(scope, report)
    _check_glyph_sets(scope, report)
    _check_page(scope, report)
    _check_conditions(scope, report)
    _check_capabilities_declared(scope, report)
    _check_budgets(scope, report)
    return report.diagnostics


# --- Pydantic errors as diagnostics -------------------------------------------

# Fields typed as a union: the loc element after them is a union tag.
_UNION_FIELDS: Final = frozenset(
    {
        "page",
        "content",
        "anchor",
        "color",
        "demanded",
        "visible_when",
        "blocked_when",
        "when",
        "condition",
        "value",
    }
)
# Lists of unions: the loc element after an index under them is a union tag.
_UNION_LIST_FIELDS: Final = frozenset(
    {"children", "layers", "conditions", "text", "values"}
)
# Mappings: the loc element after them is a key, and the one after that a field.
_MAPPING_FIELDS: Final = frozenset(
    {
        "assets",
        "glyph_sets",
        "bindings",
        "controls",
        "cells",
        "kerning",
        "cases",
        "translations",
    }
)


def diagnostics_of(error: ValidationError) -> list[PresentationDiagnostic]:
    """One ``invalid_document`` diagnostic per distinct (path, message)."""
    seen: set[tuple[str, str]] = set()
    diagnostics: list[PresentationDiagnostic] = []
    for entry in error.errors(include_url=False, include_context=False):
        located = (_loc_to_path(entry["loc"]), entry["msg"])
        if located in seen:
            continue
        seen.add(located)
        diagnostics.append(
            PresentationDiagnostic(
                code=DiagnosticCode.INVALID_DOCUMENT,
                path=located[0],
                message=located[1],
            )
        )
    return diagnostics


def _loc_to_path(loc: tuple[int | str, ...]) -> str:
    """Turn a pydantic error location into a JSON pointer into the document.

    Pydantic inserts the chosen member's tag into the location of a union
    (``('page', 'columns', 'items', 1, 'content', 'device-face', ...)``);
    those tags are not keys of the document and are dropped. A tag can only
    follow a union-typed field or an index into a list of unions, so a
    mapping key that happens to spell a tag (a binding named ``value``) is
    kept. ``('page', 'stack', 'children', 1, 'device-face', 'layers', 3,
    'glyph-text', 'anchor', 'ref', 'ref')`` becomes
    ``/page/children/1/layers/3/anchor/ref``.
    """
    parts: list[str] = []
    previous_kind = "field"
    last_field: int | str | None = None
    for part in loc:
        kind = _loc_part_kind(part, previous_kind, last_field)
        if kind != "tag":
            parts.append(str(part))
        if kind == "field":
            last_field = part
        previous_kind = kind
    return "/" + "/".join(parts)


def _loc_part_kind(
    part: int | str, previous_kind: str, last_field: int | str | None
) -> str:
    if isinstance(part, int):
        return "index"
    if previous_kind == "field" and last_field in _MAPPING_FIELDS:
        return "key"
    if previous_kind == "field" and last_field in _UNION_FIELDS:
        return "tag"
    if previous_kind == "index" and last_field in _UNION_LIST_FIELDS:
        return "tag"
    return "field"


# --- Semantic rules -----------------------------------------------------------


@dataclass(frozen=True)
class _Scope:
    document: PresentationV1
    attributes: Mapping[str, AttributeDriver]

    def attribute_of(self, binding_id: str) -> AttributeDriver | None:
        """The attribute a declared binding names, when both exist."""
        binding = self.document.bindings.get(binding_id)
        return None if binding is None else self.attributes.get(binding.attribute)


@dataclass
class _Report:
    diagnostics: list[PresentationDiagnostic] = field(default_factory=list)

    def add(self, code: DiagnosticCode, path: str, message: str) -> None:
        self.diagnostics.append(
            PresentationDiagnostic(code=code, path=path, message=message)
        )


def _check_bindings(scope: _Scope, report: _Report) -> None:
    for binding_id, binding in scope.document.bindings.items():
        if binding.attribute not in scope.attributes:
            report.add(
                DiagnosticCode.MISSING_ATTRIBUTE,
                f"/bindings/{binding_id}/attribute",
                f"attribute '{binding.attribute}' does not exist on the driver",
            )


def _check_controls(scope: _Scope, report: _Report) -> None:
    for control_id, control in scope.document.controls.items():
        path = f"/controls/{control_id}"
        attribute = _require_binding(control.binding, f"{path}/binding", scope, report)
        if attribute is not None and not _control_accepts(control.kind, attribute):
            report.add(
                DiagnosticCode.TYPE_MISMATCH,
                f"{path}/kind",
                f"a {control.kind} control cannot drive attribute "
                f"'{attribute.name}' ({_describe(attribute)})",
            )


def _control_accepts(kind: ControlKind, attribute: AttributeDriver) -> bool:
    """Toggle → bool, number/slider → numeric, select → value options."""
    if kind is ControlKind.TOGGLE:
        return attribute.data_type is DataType.BOOL
    if kind in {ControlKind.NUMBER, ControlKind.SLIDER}:
        return attribute.data_type in _NUMERIC_DATA_TYPES
    return attribute.value_options is not None


def _describe(attribute: AttributeDriver) -> str:
    options = "with" if attribute.value_options is not None else "without"
    return f"{attribute.data_type} {options} value options"


def _check_glyph_sets(scope: _Scope, report: _Report) -> None:
    for glyph_set_id, glyph_set in scope.document.glyph_sets.items():
        _require_asset(
            glyph_set.asset, f"/glyph_sets/{glyph_set_id}/asset", scope, report
        )


def _check_page(scope: _Scope, report: _Report) -> None:
    for node, path, depth in _walk_nodes(scope.document.page, "/page"):
        if depth == DOCUMENT_BUDGETS.max_layout_depth + 1:
            report.add(
                DiagnosticCode.BUDGET_EXCEEDED,
                path,
                f"layout nested deeper than {DOCUMENT_BUDGETS.max_layout_depth}",
            )
        _check_node(node, path, scope, report)


def _check_node(node: PageNode, path: str, scope: _Scope, report: _Report) -> None:
    if isinstance(node, ControlPanelNode):
        for index, control_id in enumerate(node.controls):
            _require_control(control_id, f"{path}/controls/{index}", scope, report)
    elif isinstance(node, MeasurementsNode):
        for index, item in enumerate(node.items):
            _require_binding(
                item.binding, f"{path}/items/{index}/binding", scope, report
            )
    elif isinstance(node, SetpointTableNode):
        for index, row in enumerate(node.rows):
            _check_setpoint_row(row, f"{path}/rows/{index}", scope, report)
    elif isinstance(node, DeviceFaceNode):
        _check_face(node, path, scope, report)


def _check_setpoint_row(
    row: SetpointRow, path: str, scope: _Scope, report: _Report
) -> None:
    if isinstance(row.demanded, ControlRef):
        _require_control(
            row.demanded.control, f"{path}/demanded/control", scope, report
        )
    else:
        _require_binding(
            row.demanded.binding, f"{path}/demanded/binding", scope, report
        )
    for column in ("regulated", "measured"):
        ref: BindingRef | None = getattr(row, column)
        if ref is not None:
            _require_binding(ref.binding, f"{path}/{column}/binding", scope, report)
    if row.deviation is not None:
        for operand in ("minuend", "subtrahend"):
            _require_numeric_binding(
                getattr(row.deviation, operand),
                f"{path}/deviation/{operand}",
                scope,
                report,
            )


def _check_face(
    face: DeviceFaceNode, path: str, scope: _Scope, report: _Report
) -> None:
    """Layer ids are unique; an anchor ``ref`` names an *earlier* layer."""
    earlier_ids: dict[str, int] = {}
    for index, layer in enumerate(face.layers):
        layer_path = f"{path}/layers/{index}"
        _check_layer(layer, layer_path, earlier_ids, scope, report)
        if layer.id is None:
            continue
        if layer.id in earlier_ids:
            report.add(
                DiagnosticCode.INVALID_DOCUMENT,
                f"{layer_path}/id",
                f"layer id '{layer.id}' is already used by layer "
                f"{earlier_ids[layer.id]}",
            )
        else:
            earlier_ids[layer.id] = index


def _check_layer(
    layer: FaceLayer,
    path: str,
    earlier_ids: Mapping[str, int],
    scope: _Scope,
    report: _Report,
) -> None:
    if isinstance(layer, ImageLayer):
        _require_asset(layer.asset, f"{path}/asset", scope, report)
    elif isinstance(layer, GlyphLayer):
        _require_glyph_set(layer.glyph_set, f"{path}/glyph_set", scope, report)
    elif isinstance(layer, GlyphTextLayer):
        _check_glyph_text(layer, path, earlier_ids, scope, report)
    elif isinstance(layer, ButtonLayer):
        _check_action(layer.action, f"{path}/action", scope, report)


def _check_glyph_text(
    layer: GlyphTextLayer,
    path: str,
    earlier_ids: Mapping[str, int],
    scope: _Scope,
    report: _Report,
) -> None:
    _require_glyph_set(layer.glyph_set, f"{path}/glyph_set", scope, report)
    if isinstance(layer.anchor, RefAnchor) and layer.anchor.ref not in earlier_ids:
        report.add(
            DiagnosticCode.MISSING_LAYER_REF,
            f"{path}/anchor/ref",
            f"'{layer.anchor.ref}' is not the id of an earlier layer of this face",
        )
    for index, part in enumerate(layer.text):
        _check_text_part(part, f"{path}/text/{index}", scope, report)


def _check_text_part(part: TextPart, path: str, scope: _Scope, report: _Report) -> None:
    if isinstance(part, DigitPart):
        _require_numeric_binding(
            part.digit.binding, f"{path}/digit/binding", scope, report
        )
    elif isinstance(part, NumberPart):
        _require_numeric_binding(
            part.number.binding, f"{path}/number/binding", scope, report
        )
    elif isinstance(part, SelectPart):
        _require_binding(part.select.binding, f"{path}/select/binding", scope, report)


def _check_action(
    action: FaceAction, path: str, scope: _Scope, report: _Report
) -> None:
    control = _require_control(action.control, f"{path}/control", scope, report)
    if control is None:
        return
    if action.op not in _ACTION_OPS_BY_CONTROL_KIND[control.kind]:
        report.add(
            DiagnosticCode.INVALID_ACTION,
            f"{path}/op",
            f"'{action.op}' does not apply to the {control.kind} control "
            f"'{action.control}'",
        )


# --- Conditions ---------------------------------------------------------------


def _check_conditions(scope: _Scope, report: _Report) -> None:
    for condition, path in _iter_conditions(scope.document):
        _check_condition_tree(condition, path, scope, report)


def _check_condition_tree(
    root: Condition, path: str, scope: _Scope, report: _Report
) -> None:
    """Depth and operation budgets of one condition, and typed leaves."""
    operations = 0
    for condition, condition_path, depth in _walk_condition(root, path):
        operations += 1
        if depth == DOCUMENT_BUDGETS.max_condition_depth + 1:
            report.add(
                DiagnosticCode.BUDGET_EXCEEDED,
                condition_path,
                f"condition nested deeper than {DOCUMENT_BUDGETS.max_condition_depth}",
            )
        if isinstance(condition, BindingCondition):
            _check_leaf(condition, condition_path, scope, report)
    if operations > DOCUMENT_BUDGETS.max_condition_operations:
        report.add(
            DiagnosticCode.BUDGET_EXCEEDED,
            path,
            f"condition has {operations} operations, more than "
            f"{DOCUMENT_BUDGETS.max_condition_operations}",
        )


def _check_leaf(
    condition: BindingCondition, path: str, scope: _Scope, report: _Report
) -> None:
    attribute = _require_binding(condition.binding, f"{path}/binding", scope, report)
    if attribute is None:
        return
    if isinstance(condition, EqCondition):
        _check_operand(condition.value, f"{path}/value", attribute, report)
    elif isinstance(condition, InCondition):
        for index, value in enumerate(condition.values):
            _check_operand(value, f"{path}/values/{index}", attribute, report)


def _operand_fits(value: Scalar, data_type: DataType) -> bool:
    """bool ↔ bool, int/float ↔ int/float, str ↔ str.

    ``bool`` is tested first because it is an ``int`` to Python.
    """
    if isinstance(value, bool):
        return data_type is DataType.BOOL
    if isinstance(value, int | float):
        return data_type in _NUMERIC_DATA_TYPES
    return data_type is DataType.STRING


def _check_operand(
    value: Scalar, path: str, attribute: AttributeDriver, report: _Report
) -> None:
    if not _operand_fits(value, attribute.data_type):
        report.add(
            DiagnosticCode.TYPE_MISMATCH,
            path,
            f"a {type(value).__name__} cannot be compared with attribute "
            f"'{attribute.name}' of type {attribute.data_type}",
        )


def _iter_conditions(document: PresentationV1) -> Iterator[tuple[Condition, str]]:
    """Every top-level condition of the document, with the path it sits at."""
    for node, path, _ in _walk_nodes(document.page, "/page"):
        if isinstance(node, DeviceFaceNode):
            for index, layer in enumerate(node.layers):
                yield from _layer_conditions(layer, f"{path}/layers/{index}")


def _layer_conditions(layer: FaceLayer, path: str) -> Iterator[tuple[Condition, str]]:
    if layer.visible_when is not None:
        yield layer.visible_when, f"{path}/visible_when"
    if isinstance(layer, ButtonLayer) and layer.blocked_when is not None:
        yield layer.blocked_when, f"{path}/blocked_when"
    if isinstance(layer, GlyphLayer | GlyphTextLayer) and isinstance(
        layer.color, ConditionalColor
    ):
        for index, rule in enumerate(layer.color.rules):
            yield rule.when, f"{path}/color/rules/{index}/when"


def _walk_condition(
    condition: Condition, path: str, depth: int = 1
) -> Iterator[tuple[Condition, str, int]]:
    yield condition, path, depth
    if isinstance(condition, NotCondition):
        yield from _walk_condition(condition.condition, f"{path}/condition", depth + 1)
    elif isinstance(condition, AllCondition | AnyCondition):
        for index, child in enumerate(condition.conditions):
            yield from _walk_condition(child, f"{path}/conditions/{index}", depth + 1)


# --- Capabilities and budgets -------------------------------------------------


def _check_capabilities_declared(scope: _Scope, report: _Report) -> None:
    """What the document uses, ``requires`` must announce (ADR §10, "Versions")."""
    declared = set(scope.document.requires)
    for capability in sorted(_used_capabilities(scope.document) - declared):
        report.add(
            DiagnosticCode.INVALID_DOCUMENT,
            "/requires",
            f"the document uses {capability} but does not require it",
        )


def _used_capabilities(document: PresentationV1) -> set[str]:
    nodes = [node for node, _, _ in _walk_nodes(document.page, "/page")]
    used = {_NODE_CAPABILITIES[type(node)] for node in nodes}
    if document.controls:
        used.add("controls/1")
    if any(
        control.kind is ControlKind.SLIDER for control in document.controls.values()
    ):
        used.add("slider/1")
    for node in nodes:
        if (
            isinstance(node, ColumnsNode)
            and any(item.sticky is not None for item in node.items)
        ) or (
            isinstance(node, SectionNode)
            and any(
                option is not None
                for option in (
                    node.appearance,
                    node.collapsible,
                    node.collapsed,
                    node.show_count,
                )
            )
        ):
            used.add("layout-options/1")
        if isinstance(node, MeasurementsNode) and node.layout is not None:
            used.add("measurement-layout/1")
    layers = [
        layer
        for node in nodes
        if isinstance(node, DeviceFaceNode)
        for layer in node.layers
    ]
    if any(isinstance(layer, GlyphTextLayer) for layer in layers):
        used.add("glyph-text/1")
    if any(True for _ in _iter_conditions(document)):
        used.add("conditions/1")
    return used


def _check_budgets(scope: _Scope, report: _Report) -> None:
    document = scope.document
    budgets = DOCUMENT_BUDGETS
    if len(document.bindings) > budgets.max_bindings:
        report.add(
            DiagnosticCode.BUDGET_EXCEEDED,
            "/bindings",
            f"{len(document.bindings)} bindings, more than {budgets.max_bindings}",
        )
    if len(document.controls) > budgets.max_controls:
        report.add(
            DiagnosticCode.BUDGET_EXCEEDED,
            "/controls",
            f"{len(document.controls)} controls, more than {budgets.max_controls}",
        )
    nodes = sum(
        1 + (len(node.layers) if isinstance(node, DeviceFaceNode) else 0)
        for node, _, _ in _walk_nodes(document.page, "/page")
    )
    if nodes > budgets.max_nodes:
        report.add(
            DiagnosticCode.BUDGET_EXCEEDED,
            "/page",
            f"{nodes} nodes and layers, more than {budgets.max_nodes}",
        )


# --- Shared lookups -----------------------------------------------------------


def _require_control(
    control_id: str, path: str, scope: _Scope, report: _Report
) -> Control | None:
    control = scope.document.controls.get(control_id)
    if control is None:
        report.add(
            DiagnosticCode.MISSING_CONTROL,
            path,
            f"control '{control_id}' is not declared",
        )
    return control


def _require_binding(
    binding_id: str, path: str, scope: _Scope, report: _Report
) -> AttributeDriver | None:
    """Report an undeclared binding; the bound attribute when it is known.

    A declared binding whose attribute is missing yields ``None`` silently:
    that case is reported once, at ``/bindings``, by ``_check_bindings``.
    """
    if binding_id not in scope.document.bindings:
        report.add(
            DiagnosticCode.MISSING_BINDING,
            path,
            f"binding '{binding_id}' is not declared",
        )
        return None
    return scope.attribute_of(binding_id)


def _require_numeric_binding(
    binding_id: str, path: str, scope: _Scope, report: _Report
) -> None:
    attribute = _require_binding(binding_id, path, scope, report)
    if attribute is not None and attribute.data_type not in _NUMERIC_DATA_TYPES:
        report.add(
            DiagnosticCode.TYPE_MISMATCH,
            path,
            f"binding '{binding_id}' must be numeric, attribute "
            f"'{attribute.name}' is {attribute.data_type}",
        )


def _require_asset(asset_id: str, path: str, scope: _Scope, report: _Report) -> None:
    if asset_id not in scope.document.assets:
        report.add(
            DiagnosticCode.MISSING_ASSET, path, f"asset '{asset_id}' is not declared"
        )


def _require_glyph_set(
    glyph_set_id: str, path: str, scope: _Scope, report: _Report
) -> None:
    if glyph_set_id not in scope.document.glyph_sets:
        report.add(
            DiagnosticCode.MISSING_GLYPH_SET,
            path,
            f"glyph set '{glyph_set_id}' is not declared",
        )


def _walk_nodes(
    node: PageNode, path: str, depth: int = 1
) -> Iterator[tuple[PageNode, str, int]]:
    """Every page node in document order, with its path and nesting depth."""
    yield node, path, depth
    if isinstance(node, StackNode | SectionNode):
        for index, child in enumerate(node.children):
            yield from _walk_nodes(child, f"{path}/children/{index}", depth + 1)
    elif isinstance(node, ColumnsNode):
        for index, item in enumerate(node.items):
            yield from _walk_nodes(
                item.content, f"{path}/items/{index}/content", depth + 1
            )
