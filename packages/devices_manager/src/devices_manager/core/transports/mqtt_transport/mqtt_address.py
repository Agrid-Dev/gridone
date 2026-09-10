from functools import cached_property

import jsonpath
from jsonpath import CompoundJSONPath, JSONPath
from jsonpath.exceptions import JSONPathError
from pydantic import BaseModel, field_validator

from devices_manager.core.transports.hash_model import hash_model
from devices_manager.core.transports.transport_address import (
    PushTransportAddress,
    RawTransportAddress,
)


class MqttRequest(BaseModel):
    topic: str
    message: str | dict


class MqttReplyMatch(BaseModel):
    """Recognises the reply to a read among the frames of a shared reply topic.

    A frame is the reply when ``json_path`` finds at least one match in it,
    e.g. ``$.data[?(@.name == "Temperature")]`` for a device that answers every
    request on one topic with ``{"data": [{"name": ..., "value": ...}]}``
    frames. A frame that is not JSON never matches.
    """

    json_path: str

    @field_validator("json_path")
    @classmethod
    def _compiles(cls, value: str) -> str:
        try:
            jsonpath.compile(value)
        except JSONPathError as e:
            msg = f"Invalid json_path: {e}"
            raise ValueError(msg) from e
        return value

    @cached_property
    def compiled(self) -> JSONPath | CompoundJSONPath:
        """Parsed once; ``accepts`` runs on every frame of a read in flight."""
        return jsonpath.compile(self.json_path)

    def accepts(self, payload: str) -> bool:
        try:
            return self.compiled.match(payload) is not None
        except ValueError:  # not JSON, or JSON of the wrong shape
            return False


class MqttAddress(BaseModel, PushTransportAddress):
    topic: str
    request: MqttRequest | None = None
    match: MqttReplyMatch | None = None
    message: str | dict | None = None

    @cached_property
    def id(self) -> str:
        return hash_model(self)

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MqttAddress":
        """String address = listen-only (just a topic)."""
        return cls(topic=address_str)

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "MqttAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "MqttAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
