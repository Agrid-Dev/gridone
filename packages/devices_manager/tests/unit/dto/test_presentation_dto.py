import pytest
from pydantic import TypeAdapter

from devices_manager.core.device import CoreDevice
from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.core.presentation.resources import StoredResource
from devices_manager.core.presentation.revision import get_presentation_revision
from devices_manager.dto.device_dto import core_to_dto, dto_to_base, dto_to_core
from devices_manager.dto.presentation_dto import (
    AvailablePresentationResponse,
    PresentationResponse,
    UnavailablePresentationResponse,
    presentation_response,
)


@pytest.fixture
def resources():
    return {
        name: StoredResource(b"private image bytes", "image/png", name * 8, 10, 10)
        for name in ("bezel", "main_font", "montserrat", "undeclared")
    }


def test_projection_exposes_only_declared_resources(presented_driver, resources):
    result = presentation_response(presented_driver, resources)
    assert isinstance(result, AvailablePresentationResponse)
    assert set(result.assets) == {"bezel", "main_font", "montserrat"}
    assert result.assets["bezel"].model_dump() == {
        "sha256": "bezel" * 8,
        "media_type": "image/png",
    }
    assert result.revision == get_presentation_revision(presented_driver)
    payload = result.model_dump_json()
    assert "private image bytes" not in payload
    assert "transport" not in result.model_dump()
    assert "env" not in result.model_dump()
    assert TypeAdapter(PresentationResponse).validate_json(payload) == result


@pytest.mark.parametrize("missing", ["bezel", "main_font", "montserrat"])
def test_missing_resource_disables_whole_presentation(
    presented_driver, resources, missing
):
    del resources[missing]
    result = presentation_response(presented_driver, resources)
    assert isinstance(result, UnavailablePresentationResponse)
    assert [(item.code, item.path) for item in result.diagnostics] == [
        ("missing_asset", f"/assets/{missing}")
    ]
    assert "document" not in result.model_dump()


def test_unknown_version_does_not_inspect_its_resources(presented_driver):
    presented_driver.presentation = PresentationEnvelope.model_validate(
        {"schema_version": 99, "requires": []}
    )
    result = presentation_response(presented_driver, {})
    assert isinstance(result, UnavailablePresentationResponse)
    assert [item.code for item in result.diagnostics] == ["unsupported_version"]


def test_invalidated_binding_returns_diagnostic(presented_driver, resources):
    del presented_driver.attributes["temperature"]
    result = presentation_response(presented_driver, resources)
    assert isinstance(result, UnavailablePresentationResponse)
    assert "missing_attribute" in {item.code for item in result.diagnostics}


def test_driver_without_presentation_keeps_historical_path(driver):
    assert presentation_response(driver, {}) is None


def test_device_reference_is_derived_and_never_restored(
    presented_driver, mock_transport_client
):
    device = CoreDevice(
        id="device",
        name="Device",
        driver=presented_driver,
        transport=mock_transport_client,
        config={},
        attributes={},
    )
    dto = core_to_dto(device)
    assert dto.presentation_ref is not None
    first_revision = dto.presentation_ref.revision
    assert first_revision == get_presentation_revision(presented_driver)
    assert not hasattr(dto_to_base(dto), "presentation_ref")

    presented_driver.presentation_revision = "new-resource-revision"
    restored = dto_to_core(
        dto,
        {presented_driver.id: presented_driver},
        {mock_transport_client.id: mock_transport_client},
    )
    updated = core_to_dto(restored)
    assert updated.presentation_ref is not None
    assert updated.presentation_ref.revision != first_revision
    assert updated.presentation_ref.revision == get_presentation_revision(
        presented_driver
    )


def test_device_without_presentation_has_no_reference(driver, mock_transport_client):
    device = CoreDevice(
        id="device",
        name="Device",
        driver=driver,
        transport=mock_transport_client,
        config={},
        attributes={},
    )
    assert core_to_dto(device).presentation_ref is None
