import pytest

from devices_manager.core.transport_registry import TransportRegistry
from devices_manager.dto import (
    TransportBaseDTO,
    TransportCreateDTO,
    TransportUpdateDTO,
    transport_core_to_dto,
)
from devices_manager.types import TransportProtocols
from models.errors import NotFoundError


class TestTransportRegistryIds:
    def test_ids_empty(self):
        registry = TransportRegistry()
        assert registry.ids == set()

    def test_ids_returns_transport_ids(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        assert registry.ids == {mock_transport_client.id}


class TestTransportRegistryList:
    def test_list_empty(self):
        registry = TransportRegistry()
        assert registry.list_all() == []

    def test_list_returns_dtos(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        result = registry.list_all()
        assert len(result) == 1
        assert isinstance(result[0], TransportBaseDTO)
        assert result[0].id == mock_transport_client.id


class TestTransportRegistryGet:
    def test_get_existing(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        client = registry.get(mock_transport_client.id)
        assert client is mock_transport_client

    def test_get_not_found(self):
        registry = TransportRegistry()
        with pytest.raises(NotFoundError):
            registry.get("unknown")

    def test_get_dto_existing(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        dto = registry.get_dto(mock_transport_client.id)
        assert isinstance(dto, TransportBaseDTO)
        assert dto.id == mock_transport_client.id

    def test_get_dto_not_found(self):
        registry = TransportRegistry()
        with pytest.raises(NotFoundError):
            registry.get_dto("unknown")


class TestTransportRegistryAdd:
    def test_add_from_create_dto(self):
        registry = TransportRegistry()
        create = TransportCreateDTO(
            name="New Transport",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
        dto = registry.add(create)
        assert dto.name == "New Transport"
        assert dto.protocol == TransportProtocols.HTTP
        assert dto.id in registry.ids

    def test_add_from_transport_dto(self, mock_transport_client):
        registry = TransportRegistry()
        existing_dto = transport_core_to_dto(mock_transport_client)
        dto = registry.add(existing_dto)
        assert dto.id == existing_dto.id
        assert dto.id in registry.ids


class TestTransportRegistryRemove:
    def test_remove_existing(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        removed = registry.remove(mock_transport_client.id)
        assert removed is mock_transport_client
        assert mock_transport_client.id not in registry.ids

    def test_remove_not_found(self):
        registry = TransportRegistry()
        with pytest.raises(NotFoundError):
            registry.remove("unknown")


class TestTransportRegistryUpdate:
    def test_update_name(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        updated = registry.update(
            mock_transport_client.id, TransportUpdateDTO(name="New Name")
        )
        assert updated.metadata.name == "New Name"

    @pytest.mark.asyncio
    async def test_update_config(self, mock_transport_client):
        registry = TransportRegistry({mock_transport_client.id: mock_transport_client})
        new_config = {"request_timeout": 5}
        updated = registry.update(
            mock_transport_client.id, TransportUpdateDTO(config=new_config)
        )
        assert updated.config.model_dump() == new_config

    def test_update_not_found(self):
        registry = TransportRegistry()
        with pytest.raises(NotFoundError):
            registry.update("unknown", TransportUpdateDTO(name="x"))
