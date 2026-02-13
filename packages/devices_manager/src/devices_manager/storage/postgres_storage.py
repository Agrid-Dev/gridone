from collections.abc import Sequence
from typing import Final, cast

from gridone_storage import (
    BaseSchemaManager,
    PostgresConnectionManager,
    PostgresStorageBackend,
    StorageBackend,
)
from pydantic import BaseModel

from devices_manager.dto import DeviceDTO, DriverDTO, TransportDTO, build_transport_dto
from devices_manager.types import TransportProtocols

from .devices_manager_storage import DevicesManagerStorage

_SCHEMA_STATEMENTS: Final[tuple[str, str, str]] = (
    """
    CREATE TABLE IF NOT EXISTS dm_devices (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dm_drivers (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dm_transports (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
    )
    """,
)


def _as_json_object(data: object) -> dict[str, object]:
    if not isinstance(data, dict):
        msg = "Expected JSON object payload."
        raise TypeError(msg)
    return cast("dict[str, object]", data)


class _PydanticPostgresStorageBackend[M: BaseModel](PostgresStorageBackend[M]):
    _model_cls: type[M]

    def __init__(
        self,
        connection_manager: PostgresConnectionManager,
        *,
        table_name: str,
        model_cls: type[M],
    ) -> None:
        super().__init__(connection_manager=connection_manager, table_name=table_name)
        self._model_cls = model_cls

    def serialize(self, data: M) -> object:
        return data.model_dump(mode="json")

    def deserialize(self, data: object, *, item_id: str) -> M:
        del item_id
        return self._model_cls.model_validate(_as_json_object(data))


class _TransportPostgresStorageBackend(PostgresStorageBackend[TransportDTO]):
    def serialize(self, data: TransportDTO) -> object:
        return data.model_dump(mode="json")

    def deserialize(self, data: object, *, item_id: str) -> TransportDTO:
        payload = _as_json_object(data)
        raw_protocol = payload.get("protocol")
        if raw_protocol is None:
            msg = "Transport payload is missing protocol."
            raise ValueError(msg)

        protocol = TransportProtocols(str(raw_protocol))
        raw_config = payload.get("config", {})
        if not isinstance(raw_config, dict):
            msg = "Transport payload config must be a JSON object."
            raise TypeError(msg)

        return build_transport_dto(
            transport_id=str(payload.get("id", item_id)),
            name=str(payload.get("name", "")),
            protocol=protocol,
            config=raw_config,
        )


class PostgresDevicesManagerStorage(BaseSchemaManager, DevicesManagerStorage):
    devices: StorageBackend[DeviceDTO]
    drivers: StorageBackend[DriverDTO]
    transports: StorageBackend[TransportDTO]

    def __init__(self, connection: str | PostgresConnectionManager) -> None:
        connection_manager = (
            PostgresConnectionManager(connection)
            if isinstance(connection, str)
            else connection
        )
        super().__init__(connection_manager=connection_manager)
        self.devices = _PydanticPostgresStorageBackend[DeviceDTO](
            connection_manager=connection_manager,
            table_name="dm_devices",
            model_cls=DeviceDTO,
        )
        self.drivers = _PydanticPostgresStorageBackend[DriverDTO](
            connection_manager=connection_manager,
            table_name="dm_drivers",
            model_cls=DriverDTO,
        )
        self.transports = _TransportPostgresStorageBackend(
            connection_manager=connection_manager,
            table_name="dm_transports",
        )

    @property
    def schema_statements(self) -> Sequence[str]:
        return _SCHEMA_STATEMENTS

    async def ensure_schema(self) -> None:
        await super().ensure_schema()

    async def close(self) -> None:
        await self._connection_manager.close()
