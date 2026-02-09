from typing import Any

from pydantic import BaseModel, model_validator

from devices_manager.value_adapters import FnAdapter
from devices_manager.value_adapters.factory import (
    build_value_adapter,
    spec_from_raw,
)


class DeviceConfigFieldGetter(BaseModel):
    name: str
    adapters: list[dict[str, str]]


class DiscoveryListener(BaseModel):
    """Schema for device discovery configuration."""

    _adapters: dict[str, FnAdapter] = {}
    topic: str
    field_getters: list[DeviceConfigFieldGetter]

    @model_validator(mode="after")
    def build_adapters(self) -> "DiscoveryListener":
        self._adapters = {}
        for field_getter in self.field_getters:
            adapters = [spec_from_raw(raw) for raw in field_getter.adapters]
            adapter = build_value_adapter(adapters)
            self._adapters[field_getter.name] = adapter
        return self

    def parse(self, raw_value: Any) -> dict:  # noqa: ANN401
        """Parse input from transport to a device config."""
        return {
            name: adapter.decode(raw_value) for name, adapter in self._adapters.items()
        }

    @classmethod
    def from_dict(cls, raw: dict) -> "DiscoveryListener":
        return cls(**raw)
