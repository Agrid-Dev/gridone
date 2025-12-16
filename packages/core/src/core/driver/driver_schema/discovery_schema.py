from typing import Any

from pydantic import BaseModel, Field, model_validator

from core.transports.transport_address import RawTransportAddress
from core.value_adapters.factory import ValueAdapterSpec, supported_value_adapters


class DiscoveryListenSchema(BaseModel):
    """Schema for discovery listen configuration."""

    topic: str = Field(description="MQTT topic pattern to listen for discovery messages")
    request: RawTransportAddress | None = Field(
        default=None, description="Optional request configuration for active discovery"
    )


class DiscoverySchema(BaseModel):
    """Schema for device discovery configuration."""

    listen: DiscoveryListenSchema = Field(description="Configuration for listening to discovery messages")
    parsers: dict[str, dict[str, Any]] = Field(
        description="Parsers to extract fields from discovery messages. "
        "Each key is a parser name, value is parser config (e.g., {'json_pointer': '/payload/id'})"
    )

    def _get_value_adapter_specs(self, parser_config: dict[str, Any]) -> list[ValueAdapterSpec]:
        """Extract value adapter specs from parser config dict."""
        return [
            ValueAdapterSpec(adapter=key, argument=parser_config[key])
            for key in supported_value_adapters
            if key in parser_config
        ]

    @model_validator(mode="after")
    def validate_parsers(self) -> "DiscoverySchema":
        """Validate that parsers have valid value adapter configs."""
        for parser_name, parser_config in self.parsers.items():
            if not isinstance(parser_config, dict):
                msg = f"Parser config for '{parser_name}' must be a dictionary"
                raise ValueError(msg)
            adapter_specs = self._get_value_adapter_specs(parser_config)
            if not adapter_specs:
                msg = f"No valid value adapter found in parser config for '{parser_name}'"
                raise ValueError(msg)
        return self

    def get_parser_adapter(self, parser_name: str) -> ValueAdapterSpec:
        """Get the value adapter spec for a parser."""
        if parser_name not in self.parsers:
            msg = f"Parser '{parser_name}' not found in discovery configuration"
            raise ValueError(msg)
        parser_config = self.parsers[parser_name]
        adapter_specs = self._get_value_adapter_specs(parser_config)
        if not adapter_specs:
            msg = f"No valid value adapter found for parser '{parser_name}'"
            raise ValueError(msg)
        return adapter_specs[0]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DiscoverySchema":
        """Create DiscoverySchema from dictionary."""
        return cls(**data)

