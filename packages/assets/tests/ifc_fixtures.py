# ruff: noqa: INP001 — importable helper module next to conftest, not a package
"""IFC and GLB test helpers for the assets package tests.

The IFC fixtures are generated programmatically with ifcopenshell instead of
checking binary files into the repo: a tiny two-storey model with one wall
and one space per storey, enough to exercise the whole conversion pipeline.
"""

import numpy as np


def _box_representation(builder, body, width: float, depth: float, height: float):  # noqa: ANN001, ANN202
    profile = builder.rectangle(size=[width, depth])
    solid = builder.extrude(profile, magnitude=height)
    return builder.get_representation(body, [solid])


def _place(file, product, container, *, z: float = 0.0, representation=None) -> None:  # noqa: ANN001
    """Position a product and attach it to its container.

    Spatial elements (spaces, storeys) are aggregated, everything else is
    contained — mirroring how real IFC authoring tools link products.
    """
    import ifcopenshell.api.aggregate  # noqa: PLC0415
    import ifcopenshell.api.geometry  # noqa: PLC0415
    import ifcopenshell.api.spatial  # noqa: PLC0415

    matrix = np.eye(4)
    matrix[2][3] = z
    ifcopenshell.api.geometry.edit_object_placement(
        file, product=product, matrix=matrix
    )
    if representation is not None:
        ifcopenshell.api.geometry.assign_representation(
            file, product=product, representation=representation
        )
    if product.is_a("IfcSpatialStructureElement"):
        ifcopenshell.api.aggregate.assign_object(
            file, relating_object=container, products=[product]
        )
    else:
        ifcopenshell.api.spatial.assign_container(
            file, relating_structure=container, products=[product]
        )


def _add_box_product(  # noqa: PLR0913
    file,  # noqa: ANN001
    builder,  # noqa: ANN001
    body,  # noqa: ANN001
    container,  # noqa: ANN001
    ifc_class: str,
    name: str,
    dims: tuple[float, float, float],
    z: float = 0.0,
) -> None:
    import ifcopenshell.api.root  # noqa: PLC0415

    entity = ifcopenshell.api.root.create_entity(file, ifc_class=ifc_class, name=name)
    _place(
        file,
        entity,
        container,
        z=z,
        representation=_box_representation(builder, body, *dims),
    )


def build_ifc(
    *,
    with_spaces: bool = True,
    with_geometry: bool = True,
    with_storeys: bool = True,
    with_furniture: bool = False,
    elevations: tuple[float | None, float | None] = (0.0, 3.0),
) -> bytes:
    """Build a minimal IFC4 model and return its serialized bytes."""
    import ifcopenshell.api.aggregate  # noqa: PLC0415
    import ifcopenshell.api.context  # noqa: PLC0415
    import ifcopenshell.api.geometry  # noqa: PLC0415
    import ifcopenshell.api.project  # noqa: PLC0415
    import ifcopenshell.api.root  # noqa: PLC0415
    import ifcopenshell.api.spatial  # noqa: PLC0415
    import ifcopenshell.api.unit  # noqa: PLC0415
    import ifcopenshell.util.shape_builder  # noqa: PLC0415

    file = ifcopenshell.api.project.create_file(version="IFC4")
    project = ifcopenshell.api.root.create_entity(
        file, ifc_class="IfcProject", name="Test"
    )
    # Explicit meters — the API default is millimeters, and the conversion
    # pipeline normalizes everything to SI meters.
    ifcopenshell.api.unit.assign_unit(file, length={"is_metric": True, "raw": "METERS"})
    ctx = ifcopenshell.api.context.add_context(file, context_type="Model")
    body = ifcopenshell.api.context.add_context(
        file,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=ctx,
    )
    builder = ifcopenshell.util.shape_builder.ShapeBuilder(file)

    site = ifcopenshell.api.root.create_entity(file, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(
        file, ifc_class="IfcBuilding", name="Building"
    )
    ifcopenshell.api.aggregate.assign_object(
        file, relating_object=project, products=[site]
    )
    ifcopenshell.api.aggregate.assign_object(
        file, relating_object=site, products=[building]
    )

    containers = []
    if with_storeys:
        for index, elevation in enumerate(elevations):
            storey = ifcopenshell.api.root.create_entity(
                file, ifc_class="IfcBuildingStorey", name=f"Level {index}"
            )
            if elevation is not None:
                storey.Elevation = elevation
            containers.append(storey)
        ifcopenshell.api.aggregate.assign_object(
            file, relating_object=building, products=containers
        )
    else:
        containers = [building]

    if with_geometry:
        _add_box_product(
            file, builder, body, containers[0], "IfcWall", "Wall A", (5.0, 0.2, 3.0)
        )

    if with_furniture:
        _add_box_product(
            file, builder, body, containers[0], "IfcSlab", "Slab", (5.0, 5.0, 0.2)
        )
        _add_box_product(
            file,
            builder,
            body,
            containers[0],
            "IfcFurnishingElement",
            "Bed",
            (2.0, 1.6, 0.5),
        )

    if with_spaces:
        for index, container in enumerate(containers[:2]):
            _add_box_product(
                file,
                builder,
                body,
                container,
                "IfcSpace",
                f"Room {index}01",
                (4.0, 4.0, 3.0),
                z=float(index) * 3.0,
            )

    return file.to_string().encode("utf-8")


_GLB_VERSION = 2
_JSON_CHUNK = 0x4E4F534A  # "JSON"
_BIN_CHUNK = 0x004E4942  # "BIN\0"


def parse_glb(blob: bytes) -> dict:
    """Split a GLB payload and return its decoded JSON chunk.

    Also verifies the container invariants — magic, version, total length and
    the presence of a well-sized BIN chunk — raising ``ValueError`` on any
    mismatch so a corrupted payload fails the calling test loudly.
    """
    import json  # noqa: PLC0415
    import struct  # noqa: PLC0415

    magic, version, total = struct.unpack("<4sII", blob[:12])
    if magic != b"glTF" or version != _GLB_VERSION or total != len(blob):
        msg = f"Bad GLB header: {magic!r} v{version}, total {total} != {len(blob)}"
        raise ValueError(msg)
    json_length, json_kind = struct.unpack("<II", blob[12:20])
    if json_kind != _JSON_CHUNK:
        msg = f"First GLB chunk is not JSON: {json_kind:#x}"
        raise ValueError(msg)
    document = json.loads(blob[20 : 20 + json_length])
    bin_offset = 20 + json_length
    bin_length, bin_kind = struct.unpack("<II", blob[bin_offset : bin_offset + 8])
    if bin_kind != _BIN_CHUNK:
        msg = f"Second GLB chunk is not BIN: {bin_kind:#x}"
        raise ValueError(msg)
    if bin_offset + 8 + bin_length != total:
        msg = "BIN chunk length does not close the container"
        raise ValueError(msg)
    if bin_length < document["buffers"][0]["byteLength"]:
        msg = "BIN chunk is smaller than the declared glTF buffer"
        raise ValueError(msg)
    return document


def node_tree(document: dict) -> list[dict]:
    """Materialize the glTF node hierarchy as nested dicts for assertions."""

    def build(index: int) -> dict:
        node = document["nodes"][index]
        return {
            "name": node.get("name"),
            "extras": node.get("extras"),
            "mesh": node.get("mesh"),
            "children": [build(child) for child in node.get("children", [])],
        }

    return [build(index) for index in document["scenes"][0]["nodes"]]
