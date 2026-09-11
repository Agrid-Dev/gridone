import re
from functools import cached_property
from typing import Self, cast

import jsonpath
from jsonpath import CompoundJSONPath, JSONPath
from jsonpath.exceptions import JSONPathError
from pydantic import BaseModel, Field, field_validator, model_validator

from devices_manager.core.transports.hash_model import hash_model
from devices_manager.core.transports.listener_registry import ListenerCallback
from devices_manager.core.transports.transport_address import (
    PushTransportAddress,
    RawTransportAddress,
)


class MqttRequest(BaseModel):
    topic: str
    message: str | dict


class MqttFrameMatch(BaseModel):
    """Recognises, among the frames of a topic shared by several addresses,
    those that concern one of them: the reply to a read, or the frames a
    listener should decode.

    Exactly one of:

    * ``json_path``: the frame is JSON and the path finds at least one match,
      e.g. ``$.data[?(@.name == "Temperature")]`` for a device that publishes
      ``{"data": [{"name": ..., "value": ...}]}`` frames. A frame that is not
      JSON never matches.
    * ``regex``: searched in the raw payload, without parsing it.
    * ``contains``: a plain substring of the raw payload — the cheapest check,
      for when every attribute of a device listens on the same busy topic.
      E.g. ``"Temperature"``, quotes included, accepts a frame carrying the
      Temperature variable whatever the spacing around it; the closing quote
      keeps it from also accepting ``"Temperature_Raw_1"``.

    For a listener the match only spares the codec frames it would not decode:
    a looser match costs a wasted decode, never a wrong value.
    """

    json_path: str | None = None
    regex: str | None = None
    contains: str | None = Field(default=None, min_length=1)

    @field_validator("json_path")
    @classmethod
    def _json_path_compiles(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                jsonpath.compile(value)
            except JSONPathError as e:
                msg = f"Invalid json_path: {e}"
                raise ValueError(msg) from e
        return value

    @field_validator("regex")
    @classmethod
    def _regex_compiles(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                re.compile(value)
            except re.error as e:
                msg = f"Invalid regex: {e}"
                raise ValueError(msg) from e
        return value

    @model_validator(mode="after")
    def _exactly_one_criterion(self) -> Self:
        criteria = (self.json_path, self.regex, self.contains)
        if sum(criterion is not None for criterion in criteria) != 1:
            msg = "A match needs exactly one of json_path, regex or contains"
            raise ValueError(msg)
        return self

    @cached_property
    def compiled_json_path(self) -> JSONPath | CompoundJSONPath:
        """Parsed once: ``accepts`` runs on every frame of the topic."""
        return jsonpath.compile(cast("str", self.json_path))

    @cached_property
    def compiled_regex(self) -> re.Pattern[str]:
        """Compiled once: ``accepts`` runs on every frame of the topic."""
        return re.compile(cast("str", self.regex))

    def accepts(self, payload: str) -> bool:
        if self.contains is not None:
            return self.contains in payload
        if self.regex is not None:
            return self.compiled_regex.search(payload) is not None
        try:
            return self.compiled_json_path.match(payload) is not None
        except ValueError:  # not JSON, or JSON of the wrong shape
            return False

    def only_matching(self, callback: ListenerCallback) -> ListenerCallback:
        """Wrap a listener so it only sees the frames this match accepts: a
        rejected frame costs one ``accepts`` and never reaches the codec."""

        def filtered(payload: str) -> None:
            if self.accepts(payload):
                callback(payload)

        return filtered


class MqttAddress(BaseModel, PushTransportAddress):
    topic: str
    request: MqttRequest | None = None
    match: MqttFrameMatch | None = None
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
