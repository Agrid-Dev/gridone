"""From package files to a plan: the manifest parsed within the bounded
loader's limits, driver errors located by field, the presentation assembled
by the core."""

import pytest

from devices_manager.core.presentation import (
    DiagnosticCode,
    ImageError,
    InvalidPresentationError,
    PackageFiles,
    assemble_presentation,
    read_package,
)
from devices_manager.dto.driver_dto import PackagePlan, assemble_package
from models.errors import InvalidError, SchemaValidationError

from ...core.fixtures.hostile_packages import (
    THERMOSTAT_DRIVER_YAML,
    build_zip,
    pil_png,
    simple_png,
    thermostat_files,
    thermostat_manifest,
)
from ...core.fixtures.presentations import load_thermostat_presentation

NO_ASSETS_PRESENTATION = """\
presentation:
  schema_version: 1
  requires: [layout/1]
  page:
    kind: attributes
"""


def bare(manifest: str) -> PackageFiles:
    return PackageFiles(manifest=manifest, files={})


class TestBareYaml:
    def test_without_presentation(self):
        plan = assemble_package(bare(THERMOSTAT_DRIVER_YAML))
        assert isinstance(plan, PackagePlan)
        assert plan.spec.id == "agrid_thermostat"
        assert plan.spec.presentation is None
        assert plan.resources == {}
        assert plan.diagnostics == []
        assert len(plan.revision) == 64

    def test_with_a_presentation_without_assets(self):
        plan = assemble_package(bare(THERMOSTAT_DRIVER_YAML + NO_ASSETS_PRESENTATION))
        assert plan.spec.presentation is not None
        assert plan.resources == {}

    def test_with_a_presentation_declaring_assets(self):
        with pytest.raises(InvalidPresentationError) as info:
            assemble_package(bare(thermostat_manifest()))
        assert [d.code for d in info.value.diagnostics] == [
            DiagnosticCode.MISSING_ASSET
        ] * 3


class TestArchive:
    def test_files_without_a_presentation(self):
        files = PackageFiles(
            manifest=THERMOSTAT_DRIVER_YAML, files={"assets/x.png": pil_png(2, 2)}
        )
        with pytest.raises(InvalidPresentationError) as info:
            assemble_package(files)
        assert [d.code for d in info.value.diagnostics] == [
            DiagnosticCode.UNDECLARED_FILE
        ]

    def test_thermostat_package(self):
        archive = build_zip(
            [("driver.yaml", thermostat_manifest()), *thermostat_files().items()]
        )
        files = read_package(archive)
        plan = assemble_package(files)
        assert plan.spec.id == "agrid_thermostat"
        assert plan.spec.presentation is not None
        assert plan.spec.presentation.document == load_thermostat_presentation()
        assert set(plan.resources) == {"bezel", "main_font", "montserrat"}
        core_plan = assemble_presentation(plan.spec.presentation, files.files)
        assert plan.revision == core_plan.revision

    def test_image_errors_pass_through(self):
        files = PackageFiles(
            manifest=thermostat_manifest(),
            files={
                **thermostat_files(),
                "assets/bezel.png": simple_png(4100, 4100, b""),
            },
        )
        with pytest.raises(ImageError) as info:
            assemble_package(files)
        assert info.value.path == "assets/bezel.png"


class TestManifestErrors:
    def test_hostile_yaml(self):
        laughs = "a: &a [x, x, x, x, x, x, x, x, x]\n" + "".join(
            f"{chr(98 + i)}: &{chr(98 + i)} [{', '.join([f'*{chr(97 + i)}'] * 9)}]\n"
            for i in range(8)
        )
        with pytest.raises(InvalidError, match="too_many_nodes") as info:
            assemble_package(bare(laughs))
        assert not isinstance(info.value, SchemaValidationError)

    def test_duplicate_key(self):
        with pytest.raises(InvalidError, match="duplicate_key"):
            assemble_package(bare(THERMOSTAT_DRIVER_YAML + "id: twice\n"))

    def test_driver_field_errors_are_located(self):
        manifest = THERMOSTAT_DRIVER_YAML.replace("transport: http\n", "")
        with pytest.raises(SchemaValidationError) as info:
            assemble_package(bare(manifest))
        assert [item.loc for item in info.value.errors] == [("transport",)]
        assert str(info.value).startswith("driver.yaml: transport: ")
