from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator

from devices_manager.core.codecs.factory import CodecSpec, codec_spec_from_raw
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver import AttributeDriver
from devices_manager.core.transports import RawTransportAddress  # noqa: TC001
from devices_manager.types import AttributeValueType, DataType
from models.errors import InvalidError
from models.types import Severity

_FAULT_HEALTHY_VALUE_DEFAULTS: dict[DataType, list[AttributeValueType]] = {
    DataType.BOOL: [False],
    DataType.INT: [0],
    DataType.STRING: [""],
}


class AttributeDriverSpec(BaseModel):
    kind: Literal[AttributeKind.STANDARD] = AttributeKind.STANDARD
    name: str  # core side - the target attribute name
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    confirm: bool = True
    codecs: Annotated[list[CodecSpec], Field(default_factory=list)]

    @model_validator(mode="before")
    @classmethod
    def use_read_write_as_fallback(cls, data: Any) -> Any:  # noqa: ANN401
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
    def parse_codec_specs(cls, data: Any) -> Any:  # noqa: ANN401
        if not isinstance(data, dict):
            return data
        raw_codecs = data.get("codecs")
        if raw_codecs is None:
            data["codecs"] = []
            return data
        if not isinstance(raw_codecs, list):
            msg = "Field 'codecs' must be a list"
            raise InvalidError(msg)
        parsed: list[CodecSpec] = []
        for item in raw_codecs:
            if isinstance(item, CodecSpec):
                parsed.append(item)
                continue
            if not isinstance(item, dict):
                msg = "Each codecs entry must be an object or CodecSpec"
                raise InvalidError(msg)
            if set(item.keys()) == {"name", "argument"}:
                parsed.append(CodecSpec.model_validate(item))
            elif len(item) == 1:
                parsed.append(codec_spec_from_raw(item))
            else:
                msg = (
                    "Each codecs entry must be a single-key object "
                    "(e.g. {json_pointer: /path}) or {name, argument}"
                )
                raise InvalidError(msg)
        data["codecs"] = parsed
        return data


class FaultAttributeDriverSpec(AttributeDriverSpec):
    kind: Literal[AttributeKind.FAULT] = AttributeKind.FAULT
    severity: Severity = Severity.WARNING
    healthy_values: Annotated[list[AttributeValueType], Field(default_factory=list)]

    @model_validator(mode="before")
    @classmethod
    def normalize_healthy_values(cls, data: Any) -> Any:  # noqa: ANN401
        if not isinstance(data, dict):
            return data
        has_scalar = "healthy_value" in data
        has_list = "healthy_values" in data
        if has_scalar and has_list:
            msg = (
                "Specify either 'healthy_value' (scalar) or 'healthy_values' "
                "(list), not both"
            )
            raise InvalidError(msg)
        if has_scalar:
            data["healthy_values"] = [data.pop("healthy_value")]
            return data
        if not has_list:
            raw_data_type = data.get("data_type")
            try:
                data_type = (
                    DataType(raw_data_type) if raw_data_type is not None else None
                )
            except ValueError:
                data_type = None
            if data_type in _FAULT_HEALTHY_VALUE_DEFAULTS:
                data["healthy_values"] = list(_FAULT_HEALTHY_VALUE_DEFAULTS[data_type])
        return data


def core_to_dto(attribute_driver: AttributeDriver) -> AttributeDriverSpec:
    return AttributeDriverSpec(
        name=attribute_driver.name,
        data_type=attribute_driver.data_type,
        read=attribute_driver.read,
        write=attribute_driver.write,
        confirm=attribute_driver.confirm,
        codecs=attribute_driver.codec_specs,
    )


def dto_to_core(dto: AttributeDriverSpec) -> AttributeDriver:
    return AttributeDriver(
        name=dto.name,
        data_type=dto.data_type,
        read=dto.read,
        write=dto.write,
        codec_specs=dto.codecs,
        confirm=dto.confirm,
    )
