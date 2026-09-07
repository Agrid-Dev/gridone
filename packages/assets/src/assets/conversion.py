"""Server-side IFC → GLB conversion.

Tessellates every product with a body representation, groups the resulting
meshes by ``IfcBuildingStorey``, and keeps ``IfcSpace`` volumes as individual
nodes so the viewer can use them as its interactive layer. The output scene
tree is:

    storey node (extras: kind/global_id/name/elevation/index)
    ├── merged geometry meshes, one per category — slab / furniture /
    │   envelope / structure (extras: kind="geometry", category)
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


# The scene contract version. Bump whenever the GLB shape or the extracted
# metadata changes so stored scenes are recognised as stale and rebuilt.
#   1 — baseline: storeys, spaces, per-category geometry, glazed envelope.
#   2 — spaces carry object_type + area.
CONVERTER_VERSION = 2


@dataclass
class ConversionResult:
    glb: bytes
    storeys: list[ModelStorey]
    spaces: list[ModelSpace]
    converter_version: int


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

    def merged(self) -> SceneMesh | None:
        if not self.positions:
            return None
        return SceneMesh(
            positions=np.concatenate(self.positions),
            normals=np.concatenate(self.normals),
            indices=np.concatenate(self.indices),
        )


# Geometry is merged per category so the viewer can style each independently:
# dark floor plates, the glazed outer envelope, ghosted inner partitions and
# props.
GEOMETRY_CATEGORIES = ("slab", "furniture", "envelope", "structure")

_SLAB_CLASSES = ("IfcSlab", "IfcRoof")
_FURNITURE_CLASSES = (
    "IfcFurnishingElement",
    "IfcFurniture",
    "IfcSystemFurnitureElement",
)
# Only these can form the outer skin; everything else stays an inner partition
# even when it happens to sit against the building's outer boundary.
_ENVELOPE_CLASSES = (
    "IfcWall",
    "IfcCurtainWall",
    "IfcPlate",
    "IfcWindow",
    "IfcRailing",
)

# An element belongs to the envelope when its plan footprint *coincides* with
# the building's — a centimetre-scale test, not a proximity one, so an inner
# partition running parallel to a facade is not swept in with it.
_ENVELOPE_EPSILON_M = 0.1


def _category_of(element) -> str:  # noqa: ANN001 — ifcopenshell has no stubs
    """Class-based category; envelope walls are split out later, in a second
    pass, because that needs the building's overall footprint."""
    if any(element.is_a(cls) for cls in _SLAB_CLASSES):
        return "slab"
    if any(element.is_a(cls) for cls in _FURNITURE_CLASSES):
        return "furniture"
    return "structure"


def _is_external(element) -> bool | None:  # noqa: ANN001 — ifcopenshell has no stubs
    """`IsExternal` of the element's `Pset_*Common`, when the model carries it.

    This is how a well-formed IFC states that a wall is on the outer skin;
    many exports omit it, hence the geometric fallback.
    """
    import ifcopenshell.util.element  # noqa: PLC0415

    for name, properties in ifcopenshell.util.element.get_psets(element).items():
        if name.endswith("Common") and "IsExternal" in properties:
            value = properties["IsExternal"]
            if isinstance(value, bool):
                return value
    return None


def _space_object_type(element) -> str | None:  # noqa: ANN001 — ifcopenshell has no stubs
    """Free-text classification of a space: its ``ObjectType``, else its
    ``LongName``. Neither is authoritative — it only labels the room."""
    for value in (element.ObjectType, element.LongName):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _space_area(element) -> float | None:  # noqa: ANN001 — ifcopenshell has no stubs
    """Net floor area (m²) from ``Qto_SpaceBaseQuantities`` when present.

    ifcopenshell normalises quantities to SI, so the value is already in
    square metres regardless of the source model's units.
    """
    import ifcopenshell.util.element  # noqa: PLC0415

    quantities = ifcopenshell.util.element.get_psets(element, qtos_only=True)
    base = quantities.get("Qto_SpaceBaseQuantities", {})
    value = base.get("NetFloorArea") or base.get("GrossFloorArea")
    if isinstance(value, (int, float)) and np.isfinite(value) and value > 0:
        return float(value)
    return None


@dataclass
class _Footprint:
    """Plan-view (X, Z) bounds of the building fabric, in glTF Y-up space."""

    min_x: float = float("inf")
    min_z: float = float("inf")
    max_x: float = float("-inf")
    max_z: float = float("-inf")

    def add(self, positions: np.ndarray) -> None:
        self.min_x = min(self.min_x, float(positions[:, 0].min()))
        self.max_x = max(self.max_x, float(positions[:, 0].max()))
        self.min_z = min(self.min_z, float(positions[:, 2].min()))
        self.max_z = max(self.max_z, float(positions[:, 2].max()))

    def touches(self, positions: np.ndarray, epsilon: float) -> bool:
        """True when the mesh reaches one of the four outer edges."""
        return (
            float(positions[:, 0].min()) - self.min_x < epsilon
            or self.max_x - float(positions[:, 0].max()) < epsilon
            or float(positions[:, 2].min()) - self.min_z < epsilon
            or self.max_z - float(positions[:, 2].max()) < epsilon
        )


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
    # Envelope detection needs the whole footprint, which is only known once
    # every wall has been tessellated — so candidates are held back and
    # classified in a second pass.
    footprint = _Footprint()
    candidates: list[
        tuple[_StoreyBucket, np.ndarray, np.ndarray, np.ndarray, bool | None]
    ] = []
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
                    object_type=_space_object_type(element),
                    area=_space_area(element),
                )
                mesh = SceneMesh(
                    positions=positions,
                    normals=normals,
                    indices=indices,
                    material=SPACE_MATERIAL,
                )
                bucket.spaces.append((space, mesh))
                spaces.append(space)
            elif any(element.is_a(cls) for cls in _ENVELOPE_CLASSES):
                footprint.add(positions)
                candidates.append(
                    (bucket, positions, normals, indices, _is_external(element))
                )
            else:
                bucket.geometry[_category_of(element)].add(positions, normals, indices)
        if not iterator.next():
            break

    for bucket, positions, normals, indices, external in candidates:
        on_skin = (
            external
            if external is not None
            else footprint.touches(positions, _ENVELOPE_EPSILON_M)
        )
        category = "envelope" if on_skin else "structure"
        bucket.geometry[category].add(positions, normals, indices)
    return spaces


def _bucket_node(bucket: _StoreyBucket, index: int | None) -> SceneNode:
    """Scene node for one storey's merged geometry — or, with no index, for the
    geometry that belongs to no storey."""
    kind = "storey" if index is not None else "unassigned"
    extras: dict = {"kind": kind}
    if index is not None:
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
        merged = bucket.geometry[category].merged()
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

    roots = [_bucket_node(bucket, index) for index, bucket in enumerate(sorted_buckets)]
    if unassigned.has_geometry or unassigned.spaces:
        roots.append(_bucket_node(unassigned, None))

    return ConversionResult(
        glb=write_glb(roots),
        storeys=[bucket.storey for bucket in sorted_buckets],
        spaces=spaces,
        converter_version=CONVERTER_VERSION,
    )


__all__ = ["ConversionError", "ConversionResult", "convert_ifc"]
