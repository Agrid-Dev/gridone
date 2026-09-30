"""Redaction of submitted values in config validation errors, wherever the
error is raised: on the encoded (or secret) node itself, or on any node that
encloses its value — a union, a `$ref` with siblings, an `allOf` split, an
array or object constraint.

Started by an independent tester, whose tests pinned the enclosing-node leaks
before the redaction was decided by location rather than by the failing node.
"""

from typing import Any

import pytest

from apps.config_validation import validate_config
from apps.errors import (
    ConfigValidationError,
    InvalidAppSchemaError,
    ValidationErrorItem,
)

IMAGE: dict[str, Any] = {
    "type": "string",
    "contentMediaType": "image/png",
    "contentEncoding": "base64",
}
# Stands for a whole base64 file; long enough to be unmistakable in a message.
BLOB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
SECRET = "hunter2-sk-live"  # noqa: S105 — a fake credential


def _errors(
    payload: dict[str, Any], schema: dict[str, Any]
) -> tuple[list[ValidationErrorItem], str]:
    with pytest.raises(ConfigValidationError) as exc_info:
        validate_config(payload, schema)
    return exc_info.value.errors, str(exc_info.value)


def _obj(**properties: Any) -> dict[str, Any]:
    return {"type": "object", "properties": properties}


class TestRedactedAtTheEncodedNode:
    """Errors raised on the node that carries `contentEncoding` itself."""

    def test_an_item_of_an_image_array(self):
        schema = _obj(logos={"type": "array", "items": IMAGE | {"maxLength": 8}})

        errors, summary = _errors({"logos": ["AAAA", BLOB]}, schema)

        [item] = errors
        assert item.loc == ("logos", 1)
        assert item.msg == "must be at most 8 characters"
        assert BLOB not in summary

    def test_an_image_reached_through_a_ref(self):
        schema = _obj(logo={"$ref": "#/$defs/Logo"}) | {
            "$defs": {"Logo": IMAGE | {"maxLength": 8}}
        }

        [item], _ = _errors({"logo": BLOB}, schema)

        assert item.msg == "must be at most 8 characters"

    def test_an_enum_on_an_image_node(self):
        [item], _ = _errors({"logo": BLOB}, _obj(logo=IMAGE | {"enum": ["AAAA"]}))

        assert item.msg == "is not one of the allowed values"

    def test_any_declared_encoding_redacts(self):
        """Keyed on the keyword, not on `base64`: a base16 blob weighs as much."""
        schema = _obj(
            blob={"type": "string", "contentEncoding": "base16"} | {"maxLength": 8}
        )

        [item], _ = _errors({"blob": BLOB}, schema)

        assert item.msg == "must be at most 8 characters"

    def test_a_required_error_names_the_key_never_a_value(self):
        schema = _obj(logo=IMAGE, other=IMAGE | {"maxLength": 8}) | {
            "required": ["logo"]
        }

        errors, summary = _errors({"other": BLOB}, schema)

        assert [(e.loc, e.type) for e in errors] == [
            (("logo",), "missing"),
            (("other",), "maxLength"),
        ]
        assert BLOB not in summary


@pytest.mark.parametrize(
    ("schema", "payload", "value"),
    [
        pytest.param(
            # pydantic's `Optional[...]`, which the UI dialect unwraps.
            _obj(logo={"anyOf": [IMAGE | {"maxLength": 8}, {"type": "null"}]}),
            {"logo": BLOB},
            BLOB,
            id="image-in-nullable-anyOf",
        ),
        pytest.param(
            _obj(logo={"oneOf": [IMAGE | {"maxLength": 8}, {"type": "null"}]}),
            {"logo": BLOB},
            BLOB,
            id="image-in-oneOf",
        ),
        pytest.param(
            _obj(logo={"$ref": "#/$defs/Image", "maxLength": 8})
            | {"$defs": {"Image": IMAGE}},
            {"logo": BLOB},
            BLOB,
            id="ref-with-a-sibling-maxLength",
        ),
        pytest.param(
            _obj(logo={"allOf": [IMAGE, {"maxLength": 8}]}),
            {"logo": BLOB},
            BLOB,
            id="allOf-split",
        ),
        pytest.param(
            _obj(logos={"type": "array", "uniqueItems": True, "items": IMAGE}),
            {"logos": [BLOB, BLOB]},
            BLOB,
            id="array-uniqueItems",
        ),
        pytest.param(
            _obj(logo=IMAGE, name={"type": "string"}) | {"maxProperties": 1},
            {"logo": BLOB, "name": "Lobby"},
            BLOB,
            id="root-maxProperties",
        ),
        pytest.param(
            # Same cause for secrets: pydantic's Optional[SecretStr].
            _obj(
                api_key={
                    "anyOf": [
                        {"type": "string", "format": "password", "minLength": 20},
                        {"type": "null"},
                    ]
                }
            ),
            {"api_key": SECRET},
            SECRET,
            id="secret-in-nullable-anyOf",
        ),
        pytest.param(
            # A field inside a secret object: its value is part of the secret.
            _obj(
                credentials={
                    "type": "object",
                    "secret": True,
                    "properties": {"token": {"type": "string", "minLength": 20}},
                }
            ),
            {"credentials": {"token": SECRET}},
            SECRET,
            id="field-inside-a-secret-object",
        ),
        pytest.param(
            # Control: `not` on the encoded node itself is redacted.
            _obj(logo=IMAGE | {"not": {"const": BLOB}}),
            {"logo": BLOB},
            BLOB,
            id="control-not-on-the-node",
        ),
    ],
)
def test_the_value_is_never_echoed(schema, payload, value):
    errors, summary = _errors(payload, schema)

    assert [e.msg for e in errors if value in e.msg] == []
    assert value not in summary


# Every way a schema can reach a value. A root `maxProperties: 0` fails on any
# payload with an error at the root, whose message would embed the whole
# payload: only the walk down to the image keeps the value out of it.
_ROOT_FAILS = {"maxProperties": 0}


@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        pytest.param(
            {"patternProperties": {"^lo": IMAGE}} | _ROOT_FAILS,
            {"logo": BLOB},
            id="patternProperties",
        ),
        pytest.param(
            {"additionalProperties": IMAGE} | _ROOT_FAILS,
            {"logo": BLOB},
            id="additionalProperties",
        ),
        pytest.param(
            {"unevaluatedProperties": IMAGE} | _ROOT_FAILS,
            {"logo": BLOB},
            id="unevaluatedProperties",
        ),
        pytest.param(
            _obj(logos={"prefixItems": [IMAGE]}) | _ROOT_FAILS,
            {"logos": [BLOB]},
            id="prefixItems",
        ),
        pytest.param(
            _obj(logos={"contains": IMAGE}) | _ROOT_FAILS,
            {"logos": [BLOB]},
            id="contains",
        ),
        pytest.param(
            _obj(logos={"unevaluatedItems": IMAGE}) | _ROOT_FAILS,
            {"logos": [BLOB]},
            id="unevaluatedItems",
        ),
        pytest.param(
            {"dependentSchemas": {"name": _obj(logo=IMAGE)}} | _ROOT_FAILS,
            {"name": "Lobby", "logo": BLOB},
            id="dependentSchemas",
        ),
        pytest.param(
            _obj(logo={"if": {"type": "string"}, "then": IMAGE}) | _ROOT_FAILS,
            {"logo": BLOB},
            id="if-then",
        ),
        pytest.param(
            _obj(logo={"if": {"type": "integer"}, "else": IMAGE}) | _ROOT_FAILS,
            {"logo": BLOB},
            id="if-else",
        ),
        pytest.param(
            # An `if` that recognises an image, and a `then` that caps it.
            _obj(logo={"if": IMAGE, "then": {"maxLength": 8}}),
            {"logo": BLOB},
            id="if",
        ),
        pytest.param(
            _obj(logo={"not": IMAGE}),
            {"logo": BLOB},
            id="not",
        ),
        pytest.param(
            # jsonschema resolves a `$dynamicRef` statically, like a `$ref`.
            _obj(logo={"$dynamicRef": "#image", "maxLength": 8})
            | {"$defs": {"Image": IMAGE | {"$dynamicAnchor": "image"}}},
            {"logo": BLOB},
            id="dynamicRef",
        ),
        pytest.param(
            # The `$id` rebases the `$ref`: it points at the node's own `$defs`.
            _obj(
                logo={
                    "$id": "https://example.com/logo",
                    "$ref": "#/$defs/Image",
                    "maxLength": 8,
                    "$defs": {"Image": IMAGE},
                }
            ),
            {"logo": BLOB},
            id="ref-rebased-by-an-id",
        ),
    ],
)
def test_every_applicator_leads_the_walk_to_the_value(schema, payload):
    errors, summary = _errors(payload, schema)

    assert [e.msg for e in errors if BLOB in e.msg] == []
    assert BLOB not in summary


@pytest.mark.parametrize(
    ("schema", "payload", "loc", "msg"),
    [
        pytest.param(
            _obj(logo={"anyOf": [IMAGE | {"maxLength": 8}, {"type": "null"}]}),
            {"logo": BLOB},
            ("logo",),
            "is not valid under any of the given schemas",
            id="anyOf",
        ),
        pytest.param(
            _obj(logo={"oneOf": [IMAGE | {"maxLength": 8}, {"type": "null"}]}),
            {"logo": BLOB},
            ("logo",),
            "is not valid under any of the given schemas",
            id="oneOf-matching-no-branch",
        ),
        pytest.param(
            _obj(logo={"oneOf": [IMAGE, {"type": "string"}]}),
            {"logo": BLOB},
            ("logo",),
            "is valid under more than one of the given schemas",
            id="oneOf-matching-several-branches",
        ),
        pytest.param(
            _obj(logos={"type": "array", "uniqueItems": True, "items": IMAGE}),
            {"logos": [BLOB, BLOB]},
            ("logos",),
            "has non-unique elements",
            id="uniqueItems",
        ),
        pytest.param(
            _obj(logos={"type": "array", "minItems": 2, "items": IMAGE}),
            {"logos": [BLOB]},
            ("logos",),
            "must have at least 2 items",
            id="minItems",
        ),
        pytest.param(
            _obj(logos={"type": "array", "maxItems": 2, "items": IMAGE}),
            {"logos": [BLOB, BLOB, BLOB]},
            ("logos",),
            "must have at most 2 items",
            id="maxItems",
        ),
        pytest.param(
            _obj(logo=IMAGE) | {"minProperties": 2},
            {"logo": BLOB},
            (),
            "must have at least 2 properties",
            id="minProperties",
        ),
        pytest.param(
            _obj(logo=IMAGE) | {"maxProperties": 2},
            {"logo": BLOB, "name": "Lobby", "floor": 3},
            (),
            "must have at most 2 properties",
            id="maxProperties",
        ),
        pytest.param(
            _obj(logo={"not": IMAGE}),
            {"logo": BLOB},
            ("logo",),
            "does not satisfy the 'not' constraint",
            id="any-other-keyword",
        ),
    ],
)
def test_a_redacted_message_still_names_the_broken_constraint(
    schema, payload, loc, msg
):
    [item], _ = _errors(payload, schema)

    assert (item.loc, item.msg) == (loc, msg)


def test_a_sibling_of_a_redacted_value_keeps_its_actionable_message():
    """Only the branch that holds the value goes value-free."""
    schema = _obj(logo=IMAGE | {"maxLength": 8}, name={"minLength": 5})

    errors, _ = _errors({"logo": BLOB, "name": "Hi"}, schema)

    assert [(e.loc, e.msg) for e in errors] == [
        (("logo",), "must be at most 8 characters"),
        (("name",), "'Hi' is too short"),
    ]


def test_a_dangling_ref_met_only_by_the_redaction_walk_is_the_apps_fault():
    """Validation stops at the first matching `anyOf` branch; the walk
    follows every branch, and meets the dangling `$ref` in the second."""
    schema = (
        _obj(logo={"anyOf": [{"type": "string"}, {"$ref": "#/$defs/Missing"}]})
        | _ROOT_FAILS
    )

    with pytest.raises(InvalidAppSchemaError):
        validate_config({"logo": BLOB}, schema)
