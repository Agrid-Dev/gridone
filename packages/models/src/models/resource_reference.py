import re
from dataclasses import dataclass
from typing import Literal, cast, get_args

from models.errors import InvalidError

ResourceType = Literal[
    "device", "driver", "transport", "command", "automation", "fault", "asset"
]

_RESOURCE_TYPES: frozenset[str] = frozenset(get_args(ResourceType))

_URI_PATTERN = re.compile(r"^resource://([^/]+)/(.+)$")
"""Matches resource://<resource_type>/<resource_id> — e.g. resource://device/abc123"""


@dataclass(frozen=True)
class ResourceReference:
    resource_type: ResourceType
    resource_id: str

    def serialize(self) -> str:
        return f"resource://{self.resource_type}/{self.resource_id}"

    @classmethod
    def parse(cls, s: str) -> "ResourceReference":
        match = _URI_PATTERN.match(s)
        if not match:
            msg = f"Invalid resource reference URI: {s!r}"
            raise InvalidError(msg)
        resource_type, resource_id = match.group(1), match.group(2)
        if resource_type not in _RESOURCE_TYPES:
            msg = f"Unknown resource type: {resource_type!r}"
            raise InvalidError(msg)
        return cls(
            resource_type=cast("ResourceType", resource_type),
            resource_id=resource_id,
        )
