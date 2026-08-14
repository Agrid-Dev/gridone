from typing import ClassVar

from pydantic import BaseModel

HOST_PATTERN = r"^[^\s:/]+(\.[^\s:/]+)*$"


class BaseTransportConfig(BaseModel):
    # Secret fields preserve their stored value when a PATCH sends them
    # blank (see transport_dto.preserve_on_blank_field_names). A config class
    # lists field names here to opt out of that, when blank already carries
    # its own meaning. ClassVar, not a Field: this is backend-only and must
    # not leak into the public JSON schema via json_schema_extra.
    PRESERVE_ON_BLANK_EXEMPT: ClassVar[frozenset[str]] = frozenset()
