from __future__ import annotations

from functools import cached_property
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator

from devices_manager.core.codecs import FnCodec, build_codec
from devices_manager.core.codecs.factory import CodecSpec, codec_spec_from_raw
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.transports import RawTransportAddress  # noqa: TC001
from devices_manager.types import AttributeValueType, DataType
from models.errors import InvalidError
from models.types import Severity

_FAULT_HEALTHY_VALUE_DEFAULTS: dict[DataType, list[AttributeValueType]] = {
    DataType.BOOL: [False],
    DataType.INT: [0],
    DataType.STRING: [""],
}


class AttributeDriver(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    kind: Literal[AttributeKind.STANDARD] = AttributeKind.STANDARD
    name: str  # core side - the target attribute name
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    # Shared default for both directions; read/write_codecs override per direction.
    codecs: Annotated[list[CodecSpec], Field(default_factory=list)]
    read_codecs: list[CodecSpec] | None = None
    write_codecs: list[CodecSpec] | None = None

    @cached_property
    def read_codec(self) -> FnCodec:
        specs = self.read_codecs if self.read_codecs is not None else self.codecs
        return build_codec(specs)

    @cached_property
    def write_codec(self) -> FnCodec:
        specs = self.write_codecs if self.write_codecs is not None else self.codecs
        return build_codec(specs)

    @property
    def value_options(self) -> list[AttributeValueType] | None:
        # Allowed values may be constrained on either direction (e.g. options/
        # mapping on a write-only command), so fall back to the write chain.
        return self.read_codec.value_options or self.write_codec.value_options

    @staticmethod
    def _parse_codec_list(raw_codecs: Any) -> list[CodecSpec]:  # noqa: ANN401
        if raw_codecs is None:
            return []
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
        return parsed

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data: Any) -> Any:  # noqa: ANN401
        if not isinstance(data, dict):
            return data
        rw = data.get("read_write")
        if rw is not None:
            data.setdefault("read", rw)
            data.setdefault("write", rw)
        data["codecs"] = cls._parse_codec_list(data.get("codecs"))
        for direction in ("read", "write"):
            field = f"{direction}_codecs"
            if data.get(field) is not None:
                data[field] = cls._parse_codec_list(data[field])
            # Codecs nested in the address take precedence and keep the address clean.
            address = data.get(direction)
            if isinstance(address, dict) and "codecs" in address:
                address = dict(address)
                data[field] = cls._parse_codec_list(address.pop("codecs"))
                data[direction] = address
        return data


class FaultAttributeDriver(AttributeDriver):
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
