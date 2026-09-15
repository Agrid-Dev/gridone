"""Structural visibility and interaction consume server-resolved observations."""

from devices_manager.core.driver import AttributeDriver
from devices_manager.core.presentation import check_semantics
from devices_manager.core.presentation.models import PresentationV1
from devices_manager.core.presentation.state import project_presentation
from models.types import DataType


def document():
    known = {"op": "is_known", "binding": "target"}
    return PresentationV1.model_validate(
        {
            "schema_version": 1,
            "requires": [
                "layout/1",
                "layout-variants/1",
                "page-conditions/1",
                "control-conditions/1",
                "conditions/1",
                "controls/1",
            ],
            "bindings": {"target": {"attribute": "setpoint"}},
            "controls": {
                "target": {
                    "kind": "number",
                    "binding": "target",
                    "label": {"default": "Target"},
                    "visible_when": known,
                    "blocked_when": {"op": "eq", "binding": "target", "value": 0},
                }
            },
            "page": {
                "kind": "variant",
                "visible_when": known,
                "variants": [
                    {
                        "when": {"op": "eq", "binding": "target", "value": 22},
                        "content": {"kind": "control-panel", "controls": ["target"]},
                    },
                    {"when": known, "content": {"kind": "attributes"}},
                ],
            },
        }
    )


def test_unknown_hides_nodes_and_disables_interactions():
    state = project_presentation(document(), {}.get)
    assert state
    assert not any(state.values())


def test_first_matching_variant_wins_and_recomputes():
    state = project_presentation(document(), {"setpoint": 22}.get)
    assert state["/page/variants/0/selected"]
    assert not state["/page/variants/1/selected"]
    assert state["/controls/target/enabled"]
    state = project_presentation(document(), {"setpoint": 0}.get)
    assert state["/page/variants/1/selected"]
    assert not state["/controls/target/enabled"]


def test_structural_references_and_capabilities_are_validated():
    doc = document()
    attributes = {
        "setpoint": AttributeDriver(
            name="setpoint", data_type=DataType.FLOAT, read="/x", write="/x", codecs=[]
        )
    }
    assert not check_semantics(doc, attributes)
    doc.page.visible_when.binding = "missing"
    assert any(
        d.path == "/page/visible_when/binding" for d in check_semantics(doc, attributes)
    )
