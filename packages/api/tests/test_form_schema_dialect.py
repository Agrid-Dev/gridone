import re
from collections.abc import Mapping
from typing import cast
from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

from api.app import _build_automations_service
from assets import AssetCreate, BuildingProfile
from devices_manager.dto import TRANSPORT_CONFIG_CLASS_BY_PROTOCOL
from devices_manager.types import TransportProtocols
from users.validation import AuthPayload

DIALECT_DOCUMENTATION = "apps/ui/src/components/forms/schema-form/README.md"

FORM_SCHEMA_DIALECT_EXEMPTIONS = (
    # A dedicated ChangeEventForm/ConditionEditor renders the nested Condition;
    # this schema never enters the generic form pipeline.
    "ChangeEventTrigger",
)

_SNAKE_CASE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
_COMMON_NODE_KEYWORDS = {
    "default",
    "description",
    "examples",
    "strip_whitespace",
    "title",
    "type",
}
_STRING_KEYWORDS = {
    "maxLength",
    "minLength",
    "multiline",
    "pattern",
    "secret",
}
_NUMBER_KEYWORDS = {"exclusiveMinimum", "maximum", "minimum"}
_ARRAY_KEYWORDS = {"items", "maxItems", "minItems"}
_OBJECT_KEYWORDS = {"additionalProperties", "properties", "required"}

type JsonSchema = Mapping[str, object]


def _as_schema(value: object) -> JsonSchema | None:
    return cast("JsonSchema", value) if isinstance(value, Mapping) else None


def _resolve_ref(
    node: JsonSchema,
    defs: JsonSchema,
    path: str,
    seen: frozenset[str] = frozenset(),
) -> tuple[dict[str, object], list[str]]:
    """Resolve local Pydantic refs while preserving property-level siblings."""
    ref = node.get("$ref")
    if ref is None:
        return dict(node), []
    if not isinstance(ref, str) or not ref.startswith("#/$defs/"):
        return dict(node), [f"{path}: only local #/$defs/... references are supported"]
    if ref in seen:
        return dict(node), [f"{path}: circular reference {ref!r} is unsupported"]

    target = _as_schema(defs.get(ref.removeprefix("#/$defs/")))
    if target is None:
        return dict(node), [f"{path}: reference {ref!r} does not resolve"]

    siblings = {key: value for key, value in node.items() if key != "$ref"}
    return _resolve_ref(
        {**target, **siblings},
        defs,
        path,
        seen | {ref},
    )


def _unwrap_optional(
    node: JsonSchema,
    defs: JsonSchema,
    path: str,
) -> tuple[dict[str, object], bool, list[str]]:
    any_of = node.get("anyOf")
    if any_of is None:
        return dict(node), False, []
    if not isinstance(any_of, list) or len(any_of) != 2:
        return (
            dict(node),
            False,
            [f"{path}: anyOf must be exactly [T, null] for an optional field"],
        )

    branches: list[dict[str, object]] = []
    errors: list[str] = []
    for index, branch in enumerate(any_of):
        branch_schema = _as_schema(branch)
        if branch_schema is None:
            errors.append(f"{path}.anyOf[{index}]: branch must be a schema object")
            continue
        resolved, ref_errors = _resolve_ref(
            branch_schema, defs, f"{path}.anyOf[{index}]"
        )
        branches.append(resolved)
        errors.extend(ref_errors)
    if errors:
        return dict(node), False, errors

    null_branches = [branch for branch in branches if branch.get("type") == "null"]
    if len(null_branches) != 1:
        return (
            dict(node),
            False,
            [f"{path}: anyOf must contain one supported type and one null branch"],
        )

    non_null = next(branch for branch in branches if branch.get("type") != "null")
    siblings = {key: value for key, value in node.items() if key != "anyOf"}
    return {**non_null, **siblings}, True, []


def _unexpected_keywords(
    node: JsonSchema,
    allowed: set[str],
    path: str,
) -> list[str]:
    unexpected = sorted(set(node) - allowed)
    return [
        f"{path}: unsupported JSON Schema keyword {keyword!r}" for keyword in unexpected
    ]


def _validate_property_names(
    properties: JsonSchema,
    required: object,
    path: str,
) -> list[str]:
    errors = [
        f"{path}.{name}: property names must use snake_case"
        for name in properties
        if not _SNAKE_CASE.fullmatch(name)
    ]
    if required is None:
        return errors
    if not isinstance(required, list) or not all(
        isinstance(name, str) for name in required
    ):
        return [*errors, f"{path}: required must be an array of property names"]

    unknown = sorted(set(required) - set(properties))
    if unknown:
        errors.append(f"{path}: required names unknown properties: {unknown}")
    return errors


def _validate_scalar_constraints(
    node: JsonSchema,
    schema_type: str,
    path: str,
) -> list[str]:
    errors: list[str] = []
    if schema_type == "string":
        if "pattern" in node and not isinstance(node["pattern"], str):
            errors.append(f"{path}.pattern: must be a string")
        for keyword in ("minLength", "maxLength"):
            value = node.get(keyword)
            if value is not None and (
                not isinstance(value, int) or isinstance(value, bool) or value < 0
            ):
                errors.append(f"{path}.{keyword}: must be a non-negative integer")
        errors.extend(
            f"{path}.{keyword}: must be a boolean"
            for keyword in ("multiline", "secret", "strip_whitespace")
            if keyword in node and not isinstance(node[keyword], bool)
        )
    elif schema_type in {"integer", "number"}:
        for keyword in _NUMBER_KEYWORDS:
            value = node.get(keyword)
            if value is not None and (
                not isinstance(value, int | float) or isinstance(value, bool)
            ):
                errors.append(f"{path}.{keyword}: must be numeric")
    return errors


def _validate_scalar_node(
    node: JsonSchema,
    schema_type: str,
    path: str,
) -> list[str]:
    allowed = set(_COMMON_NODE_KEYWORDS)
    if schema_type == "string":
        allowed.update(_STRING_KEYWORDS)
    elif schema_type in {"integer", "number"}:
        allowed.update(_NUMBER_KEYWORDS)

    errors: list[str] = []
    if "enum" in node:
        allowed.add("enum")
        enum = node["enum"]
        if not isinstance(enum, list) or not enum:
            errors.append(f"{path}.enum: must be a non-empty array")
        elif any(
            isinstance(value, bool) or not isinstance(value, str | int | float)
            for value in enum
        ):
            errors.append(f"{path}.enum: values must be strings or numbers")
    errors.extend(_unexpected_keywords(node, allowed, path))
    errors.extend(_validate_scalar_constraints(node, schema_type, path))
    return errors


def _validate_node(
    raw_node: JsonSchema,
    defs: JsonSchema,
    path: str,
    position: str,
) -> list[str]:
    node, errors = _resolve_ref(raw_node, defs, path)
    if errors:
        return errors
    node, nullable, optional_errors = _unwrap_optional(node, defs, path)
    errors.extend(optional_errors)
    if optional_errors:
        return errors

    if "oneOf" in node or "allOf" in node:
        errors.append(f"{path}: oneOf/allOf unions are outside the dialect")
        return errors

    schema_type = node.get("type")
    if isinstance(schema_type, str) and schema_type in {
        "string",
        "integer",
        "number",
        "boolean",
    }:
        errors.extend(_validate_scalar_node(node, schema_type, path))
    elif schema_type == "array":
        errors.extend(_validate_array_node(node, defs, path, position))
    elif schema_type == "object":
        errors.extend(
            _validate_object_node(node, defs, path, position, nullable=nullable)
        )
    else:
        errors.append(
            f"{path}: unsupported type {schema_type!r}; expected a scalar or root array"
        )
    return errors


def _validate_array_node(
    node: JsonSchema,
    defs: JsonSchema,
    path: str,
    position: str,
) -> list[str]:
    if position != "root_property":
        return [f"{path}: nested arrays are outside the dialect"]

    errors = _unexpected_keywords(node, _COMMON_NODE_KEYWORDS | _ARRAY_KEYWORDS, path)
    for keyword in ("minItems", "maxItems"):
        value = node.get(keyword)
        if value is not None and (
            not isinstance(value, int) or isinstance(value, bool) or value < 0
        ):
            errors.append(f"{path}.{keyword}: must be a non-negative integer")

    items = _as_schema(node.get("items"))
    if items is None:
        return [*errors, f"{path}.items: arrays require one item schema"]
    return [*errors, *_validate_node(items, defs, f"{path}.items", "array_item")]


def _validate_object_node(
    node: JsonSchema,
    defs: JsonSchema,
    path: str,
    position: str,
    *,
    nullable: bool,
) -> list[str]:
    if position != "array_item":
        return [
            f"{path}: object fields are unsupported; only flat array items "
            "may be objects"
        ]

    errors = _unexpected_keywords(node, _COMMON_NODE_KEYWORDS | _OBJECT_KEYWORDS, path)
    if nullable:
        errors.append(f"{path}: nullable object array items are unsupported")
    properties = _as_schema(node.get("properties"))
    if properties is None:
        return [*errors, f"{path}.properties: flat object items require properties"]

    errors.extend(_validate_property_names(properties, node.get("required"), path))
    for name, property_node in properties.items():
        property_schema = _as_schema(property_node)
        if property_schema is None:
            errors.append(f"{path}.properties.{name}: must be a schema object")
            continue
        errors.extend(
            _validate_node(
                property_schema,
                defs,
                f"{path}.properties.{name}",
                "flat_object_property",
            )
        )
    return errors


def _dialect_errors(schema: JsonSchema) -> list[str]:
    allowed = {
        "$defs",
        "additionalProperties",
        "description",
        "properties",
        "required",
        "title",
        "type",
    }
    errors = _unexpected_keywords(schema, allowed, "schema")
    if schema.get("type") != "object":
        errors.append("schema: root must have type 'object'")

    defs = _as_schema(schema.get("$defs")) or {}
    properties = _as_schema(schema.get("properties"))
    if properties is None:
        return [*errors, "schema.properties: root properties are required"]

    errors.extend(
        _validate_property_names(properties, schema.get("required"), "schema")
    )
    for name, raw_node in properties.items():
        node = _as_schema(raw_node)
        if node is None:
            errors.append(f"schema.properties.{name}: must be a schema object")
            continue
        errors.extend(
            _validate_node(node, defs, f"schema.properties.{name}", "root_property")
        )
    return errors


def _assert_form_schema_dialect(name: str, schema: JsonSchema) -> None:
    errors = _dialect_errors(schema)
    assert not errors, (
        f"{name} is outside the generic form-schema dialect:\n- "
        + "\n- ".join(errors)
        + f"\nSee {DIALECT_DOCUMENTATION}. Extend the dialect deliberately or "
        "reshape the backend field."
    )


def _first_party_form_schemas() -> dict[str, JsonSchema]:
    automations_service = _build_automations_service(
        None,
        MagicMock(),
        MagicMock(),
        MagicMock(),
    )
    return {
        **{
            f"transport:{protocol}": config_class.model_json_schema()
            for protocol, config_class in TRANSPORT_CONFIG_CLASS_BY_PROTOCOL.items()
        },
        "BuildingProfile": BuildingProfile.model_json_schema(),
        "AssetCreate": AssetCreate.model_json_schema(),
        "AuthPayload": AuthPayload.model_json_schema(),
        **{
            f"trigger:{provider_id}": schema
            for provider_id, schema in (
                automations_service.list_trigger_schemas().items()
            )
        },
        **{
            f"action:{provider_id}": schema
            for provider_id, schema in automations_service.list_action_schemas().items()
        },
    }


FIRST_PARTY_FORM_SCHEMAS = _first_party_form_schemas()


@pytest.mark.parametrize(
    ("schema_name", "schema"),
    FIRST_PARTY_FORM_SCHEMAS.items(),
    ids=FIRST_PARTY_FORM_SCHEMAS,
)
def test_first_party_generic_form_schemas_stay_within_dialect(
    schema_name: str,
    schema: JsonSchema,
) -> None:
    if schema.get("title") in FORM_SCHEMA_DIALECT_EXEMPTIONS:
        return
    _assert_form_schema_dialect(schema_name, schema)


def test_form_schema_exemption_list_contains_only_change_event_trigger() -> None:
    assert FORM_SCHEMA_DIALECT_EXEMPTIONS == ("ChangeEventTrigger",)
    assert {
        schema.get("title")
        for schema in FIRST_PARTY_FORM_SCHEMAS.values()
        if schema.get("title") in FORM_SCHEMA_DIALECT_EXEMPTIONS
    } == set(FORM_SCHEMA_DIALECT_EXEMPTIONS)


def test_knx_flat_secure_fields_pattern_and_enum_are_supported() -> None:
    schema = TRANSPORT_CONFIG_CLASS_BY_PROTOCOL[
        TransportProtocols.KNX
    ].model_json_schema()
    properties = schema["properties"]

    assert properties["gateway_ip"]["pattern"]
    assert properties["tunneling_mode"]["enum"] == ["udp", "tcp"]
    for name in (
        "secure_device_authentication_password",
        "secure_user_password",
    ):
        assert properties[name]["anyOf"] == [
            {"type": "string"},
            {"type": "null"},
        ]
    _assert_form_schema_dialect("transport:knx", schema)


def test_mqtt_multiline_optionals_are_supported() -> None:
    schema = TRANSPORT_CONFIG_CLASS_BY_PROTOCOL[
        TransportProtocols.MQTT
    ].model_json_schema()
    properties = schema["properties"]

    for name in ("ca_cert", "client_cert", "client_key"):
        assert properties[name]["multiline"] is True
        assert {branch.get("type") for branch in properties[name]["anyOf"]} == {
            "string",
            "null",
        }
    _assert_form_schema_dialect("transport:mqtt", schema)


def test_bacnet_bounded_integer_ref_is_supported() -> None:
    schema = TRANSPORT_CONFIG_CLASS_BY_PROTOCOL[
        TransportProtocols.BACNET
    ].model_json_schema()
    node, errors = _resolve_ref(
        schema["properties"]["default_write_priority"],
        schema["$defs"],
        "default_write_priority",
    )

    assert not errors
    assert node["minimum"] == 5
    assert node["maximum"] == 16
    assert node["default"] == 8
    _assert_form_schema_dialect("transport:bacnet", schema)


def test_mbus_required_port_without_default_is_supported() -> None:
    schema = TRANSPORT_CONFIG_CLASS_BY_PROTOCOL[
        TransportProtocols.MBUS
    ].model_json_schema()

    assert "port" in schema["required"]
    assert "default" not in schema["properties"]["port"]
    _assert_form_schema_dialect("transport:mbus", schema)


def test_asset_create_enum_ref_is_supported() -> None:
    schema = AssetCreate.model_json_schema()

    assert schema["properties"]["type"] == {"$ref": "#/$defs/AssetType"}
    assert schema["$defs"]["AssetType"]["enum"] == [
        "org",
        "building",
        "floor",
        "room",
        "zone",
    ]
    _assert_form_schema_dialect("AssetCreate", schema)


class _NestedValue(BaseModel):
    value: str


class _DictionaryConfig(BaseModel):
    labels: dict[str, str]


class _NestedModelConfig(BaseModel):
    nested: _NestedValue


class _NestedArrayItem(BaseModel):
    nested: _NestedValue


class _NestedArrayConfig(BaseModel):
    rows: list[_NestedArrayItem]


@pytest.mark.parametrize(
    ("model", "error_path"),
    [
        (_DictionaryConfig, "schema.properties.labels"),
        (_NestedModelConfig, "schema.properties.nested"),
        (_NestedArrayConfig, "schema.properties.rows.items.properties.nested"),
    ],
)
def test_out_of_dialect_object_shapes_fail_actionably(
    model: type[BaseModel],
    error_path: str,
) -> None:
    with pytest.raises(AssertionError) as error:
        _assert_form_schema_dialect(model.__name__, model.model_json_schema())

    message = str(error.value)
    assert error_path in message
    assert DIALECT_DOCUMENTATION in message
    assert "Extend the dialect deliberately or reshape the backend field" in message


class _FlatArrayItem(BaseModel):
    name: str
    enabled: bool = False


class _FlatArrayConfig(BaseModel):
    rows: list[_FlatArrayItem]


def test_array_of_flat_objects_is_supported() -> None:
    _assert_form_schema_dialect(
        _FlatArrayConfig.__name__,
        _FlatArrayConfig.model_json_schema(),
    )
