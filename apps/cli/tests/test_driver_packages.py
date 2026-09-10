import os
from dataclasses import replace
from io import BytesIO
from zipfile import ZipFile

import pytest
from cli import drivers
from cli.drivers import app
from PIL import Image
from typer.testing import CliRunner

MANIFEST = b"id: demo\ntransport: http\ndevice_config: []\nattributes: []\n"
runner = CliRunner()


def test_validate_yaml(tmp_path):
    source = tmp_path / "driver.yaml"
    source.write_bytes(MANIFEST)
    result = runner.invoke(app, ["validate", str(source)])
    assert result.exit_code == 0, result.output
    assert "Valid driver demo; 0 resources" in result.output


def test_invalid_yaml_prints_code_and_location(tmp_path):
    source = tmp_path / "driver.yaml"
    source.write_bytes(MANIFEST + b"id: duplicate\n")
    result = runner.invoke(app, ["validate", str(source)])
    assert result.exit_code == 1
    assert "duplicate_key driver.yaml:5:1" in result.output


def test_pack_and_validate_round_trip(tmp_path):
    source = tmp_path / "package"
    source.mkdir()
    (source / "driver.yaml").write_bytes(MANIFEST)
    output = tmp_path / "output.zip"
    packed = runner.invoke(app, ["pack", str(source), "-o", str(output)])
    assert packed.exit_code == 0, packed.output
    with ZipFile(BytesIO(output.read_bytes())) as archive:
        assert archive.namelist() == ["driver.yaml"]
        assert archive.read("driver.yaml") == MANIFEST
    assert runner.invoke(app, ["validate", str(output)]).exit_code == 0


def test_pack_refuses_symlink_without_creating_output(tmp_path):
    source = tmp_path / "package"
    source.mkdir()
    (source / "driver.yaml").write_bytes(MANIFEST)
    (source / "linked.png").symlink_to(source / "driver.yaml")
    output = tmp_path / "output.zip"
    result = runner.invoke(app, ["pack", str(source), "-o", str(output)])
    assert result.exit_code == 1
    assert "symlink_entry" in result.output
    assert not output.exists()


def test_pack_refuses_unreferenced_file(tmp_path):
    (tmp_path / "driver.yaml").write_bytes(MANIFEST)
    (tmp_path / "unexpected.txt").write_text("no")
    output = tmp_path / "output.zip"
    result = runner.invoke(app, ["pack", str(tmp_path), "-o", str(output)])
    assert result.exit_code == 1
    assert not output.exists()


def test_pack_can_replace_its_previous_output_inside_source(tmp_path):
    (tmp_path / "driver.yaml").write_bytes(MANIFEST)
    output = tmp_path / "driver.zip"
    for _ in range(2):
        result = runner.invoke(app, ["pack", str(tmp_path), "-o", str(output)])
        assert result.exit_code == 0, result.output
        with ZipFile(output) as archive:
            assert archive.namelist() == ["driver.yaml"]


def test_pack_includes_nested_image_resources(tmp_path):
    manifest = (
        MANIFEST
        + b"""
presentation:
  schema_version: 1
  requires: [layout/1, device-face/1]
  assets:
    cover: {path: assets/cover.png}
  page:
    kind: device-face
    label: {default: Display}
    view_box: {width: 1, height: 1}
    layers:
      - kind: image
        asset: cover
        box: {x: 0, y: 0, width: 1, height: 1}
"""
    )
    (tmp_path / "driver.yaml").write_bytes(manifest)
    assets = tmp_path / "assets"
    assets.mkdir()
    Image.new("RGB", (1, 1)).save(assets / "cover.png")
    output = tmp_path / "driver.zip"
    result = runner.invoke(app, ["pack", str(tmp_path), "-o", str(output)])
    assert result.exit_code == 0, result.output
    with ZipFile(output) as archive:
        assert archive.namelist() == ["assets/cover.png", "driver.yaml"]
        assert archive.read("assets/cover.png") == (assets / "cover.png").read_bytes()
    assert runner.invoke(app, ["validate", str(output)]).exit_code == 0


@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="Named pipes require POSIX")
def test_pack_rejects_named_pipe_without_opening_it(tmp_path):
    (tmp_path / "driver.yaml").write_bytes(MANIFEST)
    os.mkfifo(tmp_path / "pipe.png")
    output = tmp_path / "driver.zip"
    result = runner.invoke(app, ["pack", str(tmp_path), "-o", str(output)])
    assert result.exit_code == 1
    assert "special_entry" in result.output
    assert not output.exists()


@pytest.mark.parametrize(
    ("presentation", "exit_code", "code"),
    [
        ("{schema_version: 99, requires: []}", 0, "unsupported_version"),
        (
            "{schema_version: 1, requires: [layout/1], "
            "bindings: {value: {attribute: missing}}, page: {kind: attributes}}",
            1,
            "missing_attribute",
        ),
    ],
)
def test_validate_reports_presentation_compatibility(
    tmp_path, presentation, exit_code, code
):
    source = tmp_path / "driver.yaml"
    source.write_bytes(MANIFEST + f"presentation: {presentation}\n".encode())
    result = runner.invoke(app, ["validate", str(source)])
    assert result.exit_code == exit_code, result.output
    assert code in result.output


def test_pack_does_not_overwrite_manifest(tmp_path):
    manifest = tmp_path / "driver.yaml"
    manifest.write_bytes(MANIFEST)
    result = runner.invoke(app, ["pack", str(tmp_path), "-o", str(manifest)])
    assert result.exit_code == 1
    assert "must not overwrite a source file" in result.output
    assert manifest.read_bytes() == MANIFEST


@pytest.mark.parametrize(
    ("limit", "value", "code"),
    [
        ("max_entries", 0, "too_many_entries"),
        ("max_manifest_bytes", len(MANIFEST) - 1, "entry_too_large"),
        ("max_total_bytes", len(MANIFEST) - 1, "declared_total_too_large"),
        ("max_archive_bytes", 1, "archive_too_large"),
    ],
)
def test_pack_checks_budgets_before_writing_output(
    tmp_path, monkeypatch, limit, value, code
):
    (tmp_path / "driver.yaml").write_bytes(MANIFEST)
    output = tmp_path / "driver.zip"
    output.write_bytes(b"previous output")
    monkeypatch.setattr(
        drivers,
        "DEFAULT_PACKAGE_LIMITS",
        replace(drivers.DEFAULT_PACKAGE_LIMITS, **{limit: value}),
    )
    result = runner.invoke(app, ["pack", str(tmp_path), "-o", str(output)])
    assert result.exit_code == 1
    assert code in result.output
    assert output.read_bytes() == b"previous output"
