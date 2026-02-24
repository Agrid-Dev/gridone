from typing import Annotated, Any

from pydantic import BaseModel, Field, model_validator

from devices_manager.core.driver import AttributeDriver
from devices_manager.core.transports import RawTransportAddress
from devices_manager.core.value_adapters.factory import (
    ValueAdapterSpec,
    supported_value_adapters,
)
from devices_manager.core.value_adapters.registry.tlv_adapter import build_tlv_adapter
from devices_manager.types import DataType


class AttributeDriverDTO(BaseModel):
    name: str  # core side - the target attribute name
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    value_adapters: Annotated[list[ValueAdapterSpec], Field(default_factory=list)]

    @model_validator(mode="before")
    @classmethod
    def use_read_write_as_fallback(cls, data: Any):  # noqa: ANN206, ANN401
        if not isinstance(data, dict):
            return data
        rw = data.get("read_write")
        if rw is not None:
            # Only fill if not already provided
            data.setdefault("read", rw)
            data.setdefault("write", rw)

        return data

    @model_validator(mode="before")
    @classmethod
    def parse_value_adapter_specs(cls, data: dict) -> dict:
        if data.get("value_adapters"):
            return data
        value_adapters = []
        for key, val in data.items():
            if key in supported_value_adapters:
                value_adapters.append({"adapter": key, "argument": val})
        data["value_adapters"] = value_adapters
        return data


def core_to_dto(attribute_driver: AttributeDriver) -> AttributeDriverDTO:
    return AttributeDriverDTO(
        name=attribute_driver.name,
        data_type=attribute_driver.data_type,
        read=attribute_driver.read,
        write=attribute_driver.write,
        value_adapters=attribute_driver.value_adapter_specs,
    )


def dto_to_core(
    dto: AttributeDriverDTO,
    tlv_types: dict | None = None,
) -> AttributeDriver:
    extra_builders = None
    if tlv_types:
        extra_builders = {"tlv": build_tlv_adapter(tlv_types)}
    return AttributeDriver(
        name=dto.name,
        data_type=dto.data_type,
        read=dto.read,
        write=dto.write,
        value_adapter_specs=dto.value_adapters,
        extra_builders=extra_builders,
    )
