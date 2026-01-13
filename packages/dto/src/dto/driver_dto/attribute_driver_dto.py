from typing import Annotated, Any

from core.driver import AttributeDriver
from core.transports import RawTransportAddress
from core.types import DataType
from core.value_adapters.factory import ValueAdapterSpec, supported_value_adapters
from pydantic import BaseModel, Field, model_validator


class AttributeDriverDTO(BaseModel):
    name: str  # core side - the target attribute name
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    value_adapter: Annotated[list[ValueAdapterSpec], Field(default_factory=list)]

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
        value_adapter = []
        for key, val in data.items():
            if key in supported_value_adapters:
                value_adapter.append({"adapter": key, "argument": val})
        data["value_adapter"] = value_adapter
        return data


def dto_to_core(attribute_driver: AttributeDriver) -> AttributeDriverDTO:
    return AttributeDriverDTO(
        name=attribute_driver.name,
        data_type=attribute_driver.data_type,
        read=attribute_driver.read,
        write=attribute_driver.write,
        value_adapter=attribute_driver.value_adapter_specs,
    )
