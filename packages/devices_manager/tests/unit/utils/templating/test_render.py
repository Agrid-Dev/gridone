from copy import deepcopy

import pytest
from devices_manager.utils.templating.render import (
    Struct,
    TemplatingContext,
    render_str,
    render_struct,
)

TEST_CONTEXT = {
    "name": "John",
    "age": 32,
    "city": "Marseille",
}


@pytest.mark.parametrize(
    ("template", "context", "expected"),
    [
        ("Hello world", TEST_CONTEXT, "Hello world"),  # nothing to render
        ("Hello world", {}, "Hello world"),
        ("Hello ${name}", TEST_CONTEXT, "Hello John"),
        ("Hello ${name} aged ${age}", TEST_CONTEXT, "Hello John aged 32"),
        (
            "Hello ${name} aged ${age} living in ${city}",
            TEST_CONTEXT,
            "Hello John aged 32 living in Marseille",
        ),
        (
            "Hello ${name} you are ${size} tall",
            TEST_CONTEXT,
            "Hello John you are ${size} tall",
        ),  # missing field. Not raising by default
        ("${age}", TEST_CONTEXT, 32),
        ("${verified}", {"verified": True}, True),
    ],
)
def test_render_str(template: str, context: dict, expected: str) -> None:
    previous_template = deepcopy(template)
    assert render_str(template, context) == expected
    assert template == previous_template  # ensure template is not modified


@pytest.mark.parametrize(
    ("template", "context", "raise_for_missing_context", "expect_raise"),
    [("Hello ${name}", {}, True, True), ("Hello ${name}", {}, False, False)],
)
def test_render_str_missing_context(
    template: str,
    context: dict,
    raise_for_missing_context: bool,
    expect_raise: bool,
) -> None:
    if expect_raise:
        with pytest.raises(ValueError, match="Missing"):
            render_str(
                template,
                context,
                raise_for_missing_context=raise_for_missing_context,
            )
    else:
        render_str(
            template,
            context,
            raise_for_missing_context=raise_for_missing_context,
        )


@pytest.mark.parametrize(
    ("struct", "context", "expected"),
    [
        ("Hello ${name}", TEST_CONTEXT, "Hello John"),
        ({"key": "Hello ${name}"}, TEST_CONTEXT, {"key": "Hello John"}),
        ({"${name}": "Age ${age}"}, TEST_CONTEXT, {"John": "Age 32"}),
        (["Hello ${name}", "Hello Alice"], TEST_CONTEXT, ["Hello John", "Hello Alice"]),
        (2, TEST_CONTEXT, 2),
        ({"key": 2}, TEST_CONTEXT, {"key": 2}),
        (
            {
                "value_list": [
                    {"name": "${name}", "age": "${age}"},
                ],
            },
            TEST_CONTEXT,
            {
                "value_list": [
                    {"name": "John", "age": 32},
                ],
            },
        ),
    ],
)
def test_render_struct(
    struct: Struct,
    context: TemplatingContext,
    expected: Struct,
) -> None:
    assert render_struct(struct, context) == expected
