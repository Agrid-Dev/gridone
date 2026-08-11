"""Server-side IFC → GLB conversion.

Tessellates every product with a body representation, groups the resulting
meshes by ``IfcBuildingStorey``, and keeps ``IfcSpace`` volumes as individual
nodes so the viewer can use them as its interactive layer. The output scene
tree is:

    storey node (extras: kind/global_id/name/elevation/index)
    ├── merged geometry meshes, one per category — slab / furniture /
    │   structure (extras: kind="geometry", category)
    └── "spaces" group
        └── one translucent node per IfcSpace (extras: kind/global_id/name)

Elements that belong to no storey (site terrain, building-level products)
are grouped under a final node with ``kind: "unassigned"``.

Coordinates are baked from IFC's Z-up convention into glTF's Y-up:
(x, y, z) → (x, z, -y). Heavy imports (ifcopenshell) stay inside functions
so importing the assets package does not pay for them.
"""

import os
from dataclasses import dataclass, field
from typing import Any, cast

import numpy as np

from assets.glb import (
    GEOMETRY_MATERIAL,
    SPACE_MATERIAL,
    SceneMesh,
    SceneNode,
    write_glb,
)
from assets.models import ModelSpace, ModelStorey


class ConversionError(Exception):
    """Raised when an uploaded file cannot be converted to a 3D scene.

    The message is user-facing — keep it readable and free of internals.
    """


@dataclass
class ConversionResult:
    glb: bytes
    storeys: list[ModelStorey]
    spaces: list[ModelSpace]


@dataclass
class _MeshAccumulator:
    """Collects per-product meshes and merges them into one buffer."""

    positions: list[np.ndarray] = field(default_factory=list)
    normals: list[np.ndarray] = field(default_factory=list)
    indices: list[np.ndarray] = field(default_factory=list)
    _vertex_count: int = 0

    def add(
        self, positions: np.ndarray, normals: np.ndarray, indices: np.ndarray
    ) -> None:
        self.positions.append(positions)
        self.normals.append(normals)
        self.indices.append(indices + self._vertex_count)
        self._vertex_count += positions.shape[0]

    def merged(self, material: int) -> SceneMesh | None:
        if not self.positions:
            return None
        return SceneMesh(
            positions=np.concatenate(self.positions),
            normals=np.concatenate(self.normals),
            indices=np.concatenate(self.indices),
            material=material,
        )


# Geometry is merged per category so the viewer can style slabs, structure
# and furniture independently (dark floor plates vs glass walls vs props).
GEOMETRY_CATEGORIES = ("slab", "furniture", "structure")

_SLAB_CLASSES = ("IfcSlab", "IfcRoof")
_FURNITURE_CLASSES = (
    "IfcFurnishingElement",
    "IfcFurniture",
    "IfcSystemFurnitureElement",
)


def _category_of(element) -> str:  # noqa: ANN001 — ifcopenshell has no stubs
    if any(element.is_a(cls) for cls in _SLAB_CLASSES):
        return "slab"
    if any(element.is_a(cls) for cls in _FURNITURE_CLASSES):
        return "furniture"
    return "structure"


@dataclass
class _StoreyBucket:
    storey: ModelStorey
    geometry: dict[str, _MeshAccumulator] = field(
        default_factory=lambda: {
            category: _MeshAccumulator() for category in GEOMETRY_CATEGORIES
        }
    )
    spaces: list[tuple[ModelSpace, SceneMesh]] = field(default_factory=list)

    @property
    def has_geometry(self) -> bool:
        return any(acc.positions for acc in self.geometry.values())


def _parse_ifc(data: bytes):  # noqa: ANN202 — ifcopenshell has no published stubs
    import ifcopenshell  # noqa: PLC0415

    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as e:
        msg = "The uploaded file is not a valid IFC file."
        raise ConversionError(msg) from e
    try:
        return ifcopenshell.file.from_string(text)
    except Exception as e:
        msg = "The uploaded file is not a valid IFC file."
        raise ConversionError(msg) from e


def _to_y_up(vertices: np.ndarray) -> np.ndarray:
    """Convert IFC Z-up coordinates to glTF Y-up: (x, y, z) → (x, z, -y)."""
    return np.column_stack((vertices[:, 0], vertices[:, 2], -vertices[:, 1])).astype(
        np.float32
    )


def _storey_of(element) -> Any:  # noqa: ANN001, ANN401 — ifcopenshell has no stubs
    """Walk the spatial/aggregation hierarchy up to the containing storey.

    Works for both contained products (walls, furniture) and aggregated
    spatial elements (IfcSpace).
    """
    import ifcopenshell.util.element  # noqa: PLC0415

    current = element
    while current is not None:
        if current.is_a("IfcBuildingStorey"):
            return current
        current = ifcopenshell.util.element.get_parent(current)
    return None


def _storey_sort_key(entry: tuple[ModelStorey, int]) -> tuple[int, float, int]:
    storey, appearance = entry
    if storey.elevation is None:
        return (1, 0.0, appearance)
    return (0, storey.elevation, appearance)


def _safe_elevation(value: object) -> float | None:
    if isinstance(value, (int, float)) and np.isfinite(value):
        return float(value)
    return None


def _ordered_storey_buckets(
    model,  # noqa: ANN001 — ifcopenshell has no published stubs
) -> tuple[dict[int, _StoreyBucket], list[_StoreyBucket]]:
    """Build one bucket per storey, ordered by elevation (appearance as tiebreak)."""
    storey_elements = model.by_type("IfcBuildingStorey")
    ordered = sorted(
        (
            (
                ModelStorey(
                    global_id=storey.GlobalId,
                    name=storey.Name or f"Level {index}",
                    elevation=_safe_elevation(storey.Elevation),
                ),
                index,
            )
            for index, storey in enumerate(storey_elements)
        ),
        key=_storey_sort_key,
    )
    by_element_id: dict[int, _StoreyBucket] = {}
    sorted_buckets: list[_StoreyBucket] = []
    for storey_model, appearance in ordered:
        bucket = _StoreyBucket(storey=storey_model)
        by_element_id[storey_elements[appearance].id()] = bucket
        sorted_buckets.append(bucket)
    return by_element_id, sorted_buckets


def _collect_geometry(
    model,  # noqa: ANN001 — ifcopenshell has no published stubs
    storeys: dict[int, _StoreyBucket],
    unassigned: _StoreyBucket,
) -> list[ModelSpace]:
    """Tessellate every product into its storey bucket; return the spaces."""
    import ifcopenshell.geom  # noqa: PLC0415

    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)  # noqa: FBT003 — SWIG positional API
    settings.set("weld-vertices", False)  # noqa: FBT003 — SWIG positional API

    threads = max(1, (os.cpu_count() or 2) - 1)
    iterator = ifcopenshell.geom.iterator(settings, model, threads)
    spaces: list[ModelSpace] = []
    if not iterator.initialize():
        return spaces
    while True:
        shape = cast("Any", iterator.get())
        element = model.by_id(shape.id)
        geometry = shape.geometry
        positions = _to_y_up(np.array(geometry.verts, dtype=np.float64).reshape(-1, 3))
        normals = _to_y_up(np.array(geometry.normals, dtype=np.float64).reshape(-1, 3))
        indices = np.array(geometry.faces, dtype=np.uint32)
        if indices.size:
            storey_element = _storey_of(element)
            bucket = (
                storeys.get(storey_element.id(), unassigned)
                if storey_element is not None
                else unassigned
            )
            if element.is_a("IfcSpace"):
                space = ModelSpace(
                    global_id=element.GlobalId,
                    name=element.Name or element.LongName or element.GlobalId,
                    storey_global_id=bucket.storey.global_id or None,
                    storey_name=bucket.storey.name or None,
                )
                mesh = SceneMesh(
                    positions=positions,
                    normals=normals,
                    indices=indices,
                    material=SPACE_MATERIAL,
                )
                bucket.spaces.append((space, mesh))
                spaces.append(space)
            else:
                bucket.geometry[_category_of(element)].add(positions, normals, indices)
        if not iterator.next():
            break
    return spaces


def _bucket_node(bucket: _StoreyBucket, kind: str, index: int | None) -> SceneNode:
    extras: dict = {"kind": kind}
    if kind == "storey":
        extras.update(
            {
                "global_id": bucket.storey.global_id,
                "name": bucket.storey.name,
                "elevation": bucket.storey.elevation,
                "index": index,
            }
        )
    node = SceneNode(
        name=f"{kind}_{index}" if index is not None else kind, extras=extras
    )
    for category in GEOMETRY_CATEGORIES:
        merged = bucket.geometry[category].merged(GEOMETRY_MATERIAL)
        if merged is not None:
            node.children.append(
                SceneNode(
                    name=f"geometry_{category}",
                    mesh=merged,
                    extras={"kind": "geometry", "category": category},
                )
            )
    if bucket.spaces:
        spaces_node = SceneNode(name="spaces", extras={"kind": "spaces"})
        spaces_node.children = [
            SceneNode(
                name="space",
                mesh=mesh,
                extras={
                    "kind": "space",
                    "global_id": space.global_id,
                    "name": space.name,
                },
            )
            for space, mesh in bucket.spaces
        ]
        node.children.append(spaces_node)
    return node


def convert_ifc(data: bytes) -> ConversionResult:
    """Convert raw IFC bytes into a GLB scene plus storey/space summaries."""
    model = _parse_ifc(data)
    storeys, sorted_buckets = _ordered_storey_buckets(model)
    unassigned = _StoreyBucket(
        storey=ModelStorey(global_id="", name="", elevation=None)
    )

    spaces = _collect_geometry(model, storeys, unassigned)

    buckets = [*sorted_buckets, unassigned]
    if not any(bucket.has_geometry or bucket.spaces for bucket in buckets):
        msg = "No 3D geometry was found in the IFC model."
        raise ConversionError(msg)

    roots = [
        _bucket_node(bucket, "storey", index)
        for index, bucket in enumerate(sorted_buckets)
    ]
    if unassigned.has_geometry or unassigned.spaces:
        roots.append(_bucket_node(unassigned, "unassigned", None))

    return ConversionResult(
        glb=write_glb(roots),
        storeys=[bucket.storey for bucket in sorted_buckets],
        spaces=spaces,
    )


__all__ = ["ConversionError", "ConversionResult", "convert_ifc"]
