from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.core.codecs import (
    CodecSpec,
    FnCodec,
    build_codec,
)

if TYPE_CHECKING:
    from devices_manager.core.transports import RawTransportAddress
    from devices_manager.types import DataType


class AttributeDriver:
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
