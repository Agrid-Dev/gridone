from functools import cached_property
from typing import assert_never

from pydantic import BaseModel, ConfigDict

from devices_manager.core.transports.hash_model import hash_model
from devices_manager.core.transports.transport_address import (
    PushTransportAddress,
    RawTransportAddress,
)


class _KnxTopicIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str


class KNXAddress(BaseModel, PushTransportAddress):
    topic: str

    @cached_property
    def id(self) -> str:
        return hash_model(_KnxTopicIdentity(topic=self.topic))

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "KNXAddress":
        return cls(topic=address_str)

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "KNXAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "KNXAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        assert_never(raw_address)
