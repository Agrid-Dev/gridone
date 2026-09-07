import struct

import numpy as np
import pytest
from ifc_fixtures import node_tree, parse_glb

from assets.glb import (
    GEOMETRY_MATERIAL,
    SPACE_MATERIAL,
    SceneMesh,
    SceneNode,
    write_glb,
)


def _triangle(material: int = GEOMETRY_MATERIAL) -> SceneMesh:
    return SceneMesh(
        positions=np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32),
        normals=np.array([[0, 0, 1], [0, 0, 1], [0, 0, 1]], dtype=np.float32),
        indices=np.array([0, 1, 2], dtype=np.uint32),
        material=material,
    )


class TestWriteGlb:
    def test_container_layout_and_node_hierarchy(self):
        root = SceneNode(
            name="storey_0",
            extras={"kind": "storey", "index": 0},
            children=[
                SceneNode(
                    name="geometry", mesh=_triangle(), extras={"kind": "geometry"}
                ),
                SceneNode(
                    name="spaces",
                    extras={"kind": "spaces"},
                    children=[
                        SceneNode(
                            name="space",
                            mesh=_triangle(SPACE_MATERIAL),
                            extras={"kind": "space", "global_id": "gid1"},
                        )
                    ],
                ),
            ],
        )
        document = parse_glb(write_glb([root]))

        tree = node_tree(document)
        assert len(tree) == 1
        storey = tree[0]
        assert storey["extras"] == {"kind": "storey", "index": 0}
        assert [child["name"] for child in storey["children"]] == ["geometry", "spaces"]
        space = storey["children"][1]["children"][0]
        assert space["extras"]["global_id"] == "gid1"

        materials = [m["name"] for m in document["materials"]]
        assert materials == ["geometry", "space"]
        geometry_mesh = document["meshes"][storey["children"][0]["mesh"]]
        assert geometry_mesh["primitives"][0]["material"] == GEOMETRY_MATERIAL
        space_mesh = document["meshes"][space["mesh"]]
        assert space_mesh["primitives"][0]["material"] == SPACE_MATERIAL

    def test_position_accessor_has_min_max(self):
        node = SceneNode(name="geometry", mesh=_triangle())
        document = parse_glb(write_glb([node]))

        primitive = document["meshes"][0]["primitives"][0]
        position = document["accessors"][primitive["attributes"]["POSITION"]]
        assert position["min"] == [0.0, 0.0, 0.0]
        assert position["max"] == [1.0, 1.0, 0.0]
        assert position["count"] == 3
        normal = document["accessors"][primitive["attributes"]["NORMAL"]]
        assert "min" not in normal

    def test_mesh_without_normals_omits_the_attribute(self):
        mesh = _triangle()
        mesh.normals = None
        document = parse_glb(write_glb([SceneNode(name="geometry", mesh=mesh)]))

        attributes = document["meshes"][0]["primitives"][0]["attributes"]
        assert "NORMAL" not in attributes

    def test_buffer_views_are_aligned_and_within_buffer(self):
        roots = [
            SceneNode(name="a", mesh=_triangle()),
            SceneNode(name="b", mesh=_triangle()),
        ]
        document = parse_glb(write_glb(roots))

        byte_length = document["buffers"][0]["byteLength"]
        for view in document["bufferViews"]:
            assert view["byteOffset"] % 4 == 0
            assert view["byteOffset"] + view["byteLength"] <= byte_length

    def test_vertex_payload_round_trips(self):
        blob = write_glb([SceneNode(name="geometry", mesh=_triangle())])
        document = parse_glb(blob)

        json_length = struct.unpack("<I", blob[12:16])[0]
        bin_start = 20 + json_length + 8
        primitive = document["meshes"][0]["primitives"][0]
        accessor = document["accessors"][primitive["attributes"]["POSITION"]]
        view = document["bufferViews"][accessor["bufferView"]]
        start = bin_start + view["byteOffset"]
        decoded = np.frombuffer(
            blob[start : start + view["byteLength"]], dtype=np.float32
        ).reshape(-1, 3)
        assert decoded == pytest.approx(
            np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32)
        )
