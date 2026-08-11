import pytest
from ifc_fixtures import build_ifc, node_tree, parse_glb

from assets.conversion import ConversionError, convert_ifc


def _storey_nodes(document: dict) -> list[dict]:
    return [node for node in node_tree(document) if node["extras"]["kind"] == "storey"]


class TestConvertIfc:
    def test_storeys_and_spaces_summaries(self, sample_ifc_bytes: bytes):
        result = convert_ifc(sample_ifc_bytes)

        assert [(s.name, s.elevation) for s in result.storeys] == [
            ("Level 0", 0.0),
            ("Level 1", 3.0),
        ]
        assert [(s.name, s.storey_name) for s in result.spaces] == [
            ("Room 001", "Level 0"),
            ("Room 101", "Level 1"),
        ]
        assert all(s.global_id for s in result.storeys)
        assert all(s.global_id for s in result.spaces)

    def test_scene_tree_follows_the_contract(self, sample_ifc_bytes: bytes):
        result = convert_ifc(sample_ifc_bytes)
        document = parse_glb(result.glb)

        storey_nodes = _storey_nodes(document)
        assert [n["extras"]["index"] for n in storey_nodes] == [0, 1]
        assert [n["extras"]["global_id"] for n in storey_nodes] == [
            s.global_id for s in result.storeys
        ]

        level0 = storey_nodes[0]
        child_kinds = [c["extras"]["kind"] for c in level0["children"]]
        assert child_kinds == ["geometry", "spaces"]
        assert level0["children"][0]["extras"]["category"] == "structure"
        space_node = level0["children"][1]["children"][0]
        assert space_node["extras"]["kind"] == "space"
        assert space_node["extras"]["global_id"] == result.spaces[0].global_id
        assert space_node["mesh"] is not None

    def test_geometry_is_baked_to_y_up(self, sample_ifc_bytes: bytes):
        """The 3 m tall wall must extend along +Y (height) after conversion."""
        result = convert_ifc(sample_ifc_bytes)
        document = parse_glb(result.glb)

        level0 = _storey_nodes(document)[0]
        geometry_node = level0["children"][0]
        primitive = document["meshes"][geometry_node["mesh"]]["primitives"][0]
        position = document["accessors"][primitive["attributes"]["POSITION"]]
        assert position["max"][1] == pytest.approx(3.0, abs=1e-3)
        assert position["min"][1] == pytest.approx(0.0, abs=1e-3)
        assert "NORMAL" in primitive["attributes"]

    def test_storeys_ordered_by_elevation_not_appearance(self):
        result = convert_ifc(build_ifc(elevations=(6.0, 0.0)))

        assert [(s.name, s.elevation) for s in result.storeys] == [
            ("Level 1", 0.0),
            ("Level 0", 6.0),
        ]

    def test_model_without_spaces_is_geometry_only(self):
        result = convert_ifc(build_ifc(with_spaces=False))

        assert result.spaces == []
        assert len(result.storeys) == 2
        document = parse_glb(result.glb)
        level0 = _storey_nodes(document)[0]
        assert [c["extras"]["kind"] for c in level0["children"]] == ["geometry"]

    def test_model_without_storeys_lands_in_unassigned(self):
        result = convert_ifc(build_ifc(with_storeys=False))

        assert result.storeys == []
        assert [s.storey_global_id for s in result.spaces] == [None]
        document = parse_glb(result.glb)
        roots = node_tree(document)
        assert [n["extras"]["kind"] for n in roots] == ["unassigned"]

    @pytest.mark.parametrize(
        "payload",
        [b"\x89PNG not an ifc", b"plain text file", b""],
        ids=["binary", "text", "empty"],
    )
    def test_invalid_payload_raises_readable_error(self, payload: bytes):
        with pytest.raises(ConversionError, match="not a valid IFC file"):
            convert_ifc(payload)

    def test_model_without_any_geometry_raises(self):
        with pytest.raises(ConversionError, match="No 3D geometry"):
            convert_ifc(build_ifc(with_geometry=False, with_spaces=False))

    def test_geometry_is_split_by_category(self):
        result = convert_ifc(build_ifc(with_furniture=True))
        document = parse_glb(result.glb)

        level0 = _storey_nodes(document)[0]
        geometry_nodes = [
            c for c in level0["children"] if c["extras"]["kind"] == "geometry"
        ]
        categories = [c["extras"]["category"] for c in geometry_nodes]
        assert categories == ["slab", "furniture", "structure"]
        assert all(c["mesh"] is not None for c in geometry_nodes)

    def test_storey_without_elevation_sorts_last(self):
        result = convert_ifc(build_ifc(elevations=(None, 3.0)))

        assert [(s.name, s.elevation) for s in result.storeys] == [
            ("Level 1", 3.0),
            ("Level 0", None),
        ]
