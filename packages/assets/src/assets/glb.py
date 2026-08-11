"""Minimal binary glTF 2.0 (GLB) writer.

Produces the building-scene contract consumed by the UI viewer: a tree of
named nodes carrying ``extras`` metadata (surfaced as ``userData`` by glTF
loaders), with triangle meshes referencing one of two fixed materials —
opaque neutral geometry and translucent space volumes.

A GLB file is a 12-byte header followed by two chunks: the JSON scene
description (padded with spaces to a 4-byte boundary) and the binary buffer
holding vertex data (padded with zeros). See the glTF 2.0 specification,
section "GLB File Format".
"""

import json
import struct
from dataclasses import dataclass, field

import numpy as np

GEOMETRY_MATERIAL = 0
SPACE_MATERIAL = 1

_MATERIALS = [
    {
        "name": "geometry",
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.78, 0.78, 0.8, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.9,
        },
        "doubleSided": True,
    },
    {
        "name": "space",
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.5, 0.7, 0.9, 0.35],
            "metallicFactor": 0.0,
            "roughnessFactor": 1.0,
        },
        "alphaMode": "BLEND",
        "doubleSided": True,
    },
]

_FLOAT = 5126  # glTF componentType GL_FLOAT
_UINT32 = 5125  # glTF componentType GL_UNSIGNED_INT
_ARRAY_BUFFER = 34962
_ELEMENT_ARRAY_BUFFER = 34963
_TRIANGLES = 4


@dataclass
class SceneMesh:
    """Triangle mesh: (N, 3) float32 positions/normals, flat uint32 indices."""

    positions: np.ndarray
    normals: np.ndarray | None
    indices: np.ndarray
    material: int = GEOMETRY_MATERIAL


@dataclass
class SceneNode:
    name: str
    mesh: SceneMesh | None = None
    children: list["SceneNode"] = field(default_factory=list)
    extras: dict | None = None


class _BufferBuilder:
    def __init__(self) -> None:
        self.chunks: list[bytes] = []
        self.views: list[dict] = []
        self.accessors: list[dict] = []
        self._offset = 0

    def _add_view(self, data: bytes, target: int) -> int:
        aligned = self._offset % 4
        if aligned:
            padding = b"\x00" * (4 - aligned)
            self.chunks.append(padding)
            self._offset += len(padding)
        self.views.append(
            {
                "buffer": 0,
                "byteOffset": self._offset,
                "byteLength": len(data),
                "target": target,
            }
        )
        self.chunks.append(data)
        self._offset += len(data)
        return len(self.views) - 1

    def add_vec3(self, array: np.ndarray, *, with_min_max: bool) -> int:
        data = np.ascontiguousarray(array, dtype=np.float32)
        view = self._add_view(data.tobytes(), _ARRAY_BUFFER)
        accessor: dict[str, object] = {
            "bufferView": view,
            "componentType": _FLOAT,
            "count": int(data.shape[0]),
            "type": "VEC3",
        }
        if with_min_max:
            accessor["min"] = [float(v) for v in data.min(axis=0)]
            accessor["max"] = [float(v) for v in data.max(axis=0)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_indices(self, array: np.ndarray) -> int:
        data = np.ascontiguousarray(array, dtype=np.uint32)
        view = self._add_view(data.tobytes(), _ELEMENT_ARRAY_BUFFER)
        self.accessors.append(
            {
                "bufferView": view,
                "componentType": _UINT32,
                "count": int(data.size),
                "type": "SCALAR",
            }
        )
        return len(self.accessors) - 1

    def payload(self) -> bytes:
        return b"".join(self.chunks)


def _pack_chunk(data: bytes, kind: bytes, pad: bytes) -> bytes:
    padding = (4 - len(data) % 4) % 4
    padded = data + pad * padding
    return struct.pack("<I4s", len(padded), kind) + padded


def write_glb(roots: list[SceneNode]) -> bytes:
    """Serialize the node tree into a self-contained GLB payload."""
    buffer = _BufferBuilder()
    meshes: list[dict] = []
    nodes: list[dict] = []

    def add_node(node: SceneNode) -> int:
        entry: dict = {"name": node.name}
        if node.extras is not None:
            entry["extras"] = node.extras
        if node.mesh is not None:
            attributes = {
                "POSITION": buffer.add_vec3(node.mesh.positions, with_min_max=True)
            }
            if node.mesh.normals is not None:
                attributes["NORMAL"] = buffer.add_vec3(
                    node.mesh.normals, with_min_max=False
                )
            meshes.append(
                {
                    "primitives": [
                        {
                            "attributes": attributes,
                            "indices": buffer.add_indices(node.mesh.indices),
                            "material": node.mesh.material,
                            "mode": _TRIANGLES,
                        }
                    ]
                }
            )
            entry["mesh"] = len(meshes) - 1
        # Reserve this node's index before descending so children come after.
        index = len(nodes)
        nodes.append(entry)
        if node.children:
            entry["children"] = [add_node(child) for child in node.children]
        return index

    root_indices = [add_node(root) for root in roots]
    payload = buffer.payload()

    document = {
        "asset": {"generator": "gridone", "version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": root_indices}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": _MATERIALS,
        "accessors": buffer.accessors,
        "bufferViews": buffer.views,
        "buffers": [{"byteLength": len(payload)}],
    }

    json_chunk = _pack_chunk(
        json.dumps(document, separators=(",", ":")).encode("utf-8"), b"JSON", b" "
    )
    bin_chunk = _pack_chunk(payload, b"BIN\x00", b"\x00")
    total = 12 + len(json_chunk) + len(bin_chunk)
    return struct.pack("<4sII", b"glTF", 2, total) + json_chunk + bin_chunk


__all__ = [
    "GEOMETRY_MATERIAL",
    "SPACE_MATERIAL",
    "SceneMesh",
    "SceneNode",
    "write_glb",
]
