from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from devices_manager.core.codecs import (
    CodecSpec,
    FnCodec,
    build_codec,
)
from devices_manager.core.device.attribute import AttributeKind
from models.types import Severity

if TYPE_CHECKING:
    from devices_manager.core.transports import RawTransportAddress
    from devices_manager.types import AttributeValueType, DataType


class AttributeDriver:
    kind: ClassVar[AttributeKind] = AttributeKind.STANDARD
    name: str
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    confirm: bool = True
    codec_specs: list[CodecSpec]
    codec: FnCodec

    def __init__(  # noqa: PLR0913
        self,
        name: str,
        data_type: DataType,
        read: RawTransportAddress,
        write: RawTransportAddress | None,
        codec_specs: list[CodecSpec],
        *,
        confirm: bool = True,
    ) -> None:
        self.name = name
        self.data_type = data_type
        self.read = read
        self.write = write
        self.confirm = confirm
        self.codec_specs = codec_specs
        self.codec = build_codec(codec_specs)

    @classmethod
    def from_dict(cls, data: dict) -> AttributeDriver:
        """@deprecated
        (instanciation from exchange/storage models to be moved in dto)"""
        from devices_manager.dto.driver_dto.attribute_driver_dto import (  # noqa: PLC0415
            AttributeDriverSpec,
            dto_to_core,
        )

        return dto_to_core(AttributeDriverSpec.model_validate(data))


class FaultAttributeDriver(AttributeDriver):
    kind: ClassVar[AttributeKind] = AttributeKind.FAULT

    severity: Severity
    healthy_values: list[AttributeValueType]

    def __init__(  # noqa: PLR0913
        self,
        name: str,
        data_type: DataType,
        read: RawTransportAddress,
        write: RawTransportAddress | None,
        codec_specs: list[CodecSpec],
        healthy_values: list[AttributeValueType],
        *,
        severity: Severity = Severity.WARNING,
        confirm: bool = True,
    ) -> None:
        super().__init__(
            name=name,
            data_type=data_type,
            read=read,
            write=write,
            codec_specs=codec_specs,
            confirm=confirm,
        )
        self.severity = severity
        self.healthy_values = healthy_values
