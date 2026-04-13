from typing import Any

from pydantic import BaseModel, model_validator

from devices_manager.core.codecs import FnCodec
from devices_manager.core.codecs.factory import build_codec, codec_spec_from_raw


class DeviceConfigFieldGetter(BaseModel):
    name: str
    codecs: list[dict[str, Any]]


class DiscoveryListener(BaseModel):
    """Schema for device discovery configuration."""

    _codecs: dict[str, FnCodec] = {}
    topic: str
    field_getters: list[DeviceConfigFieldGetter]

    @model_validator(mode="after")
    def build_codecs(self) -> "DiscoveryListener":
        self._codecs = {}
        for field_getter in self.field_getters:
            specs = [codec_spec_from_raw(raw) for raw in field_getter.codecs]
            self._codecs[field_getter.name] = build_codec(specs)
        return self

    def parse(self, raw_value: Any) -> dict:  # noqa: ANN401
        """Parse input from transport to a device config."""
        return {name: codec.decode(raw_value) for name, codec in self._codecs.items()}

    @classmethod
    def from_dict(cls, raw: dict) -> "DiscoveryListener":
        return cls(**raw)
