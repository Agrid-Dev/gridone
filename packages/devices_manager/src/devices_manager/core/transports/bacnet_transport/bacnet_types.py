from enum import StrEnum
from typing import Annotated

from pydantic import Field


class BacnetObjectType(StrEnum):
    """Object type enumeration using the canonical bacpypes3 names.

    The values are fed verbatim into ``bacpypes3.ObjectIdentifier``, so they
    must match its spelling exactly — in particular ``multi-state-*`` (with the
    leading hyphen), not ``multistate-*``. Not exhaustive.
    """

    BINARY_VALUE = "binary-value"
    BINARY_INPUT = "binary-input"
    BINARY_OUTPUT = "binary-output"
    ANALOG_VALUE = "analog-value"
    ANALOG_INPUT = "analog-input"
    ANALOG_OUTPUT = "analog-output"
    MULTISTATE_VALUE = "multi-state-value"
    MULTISTATE_INPUT = "multi-state-input"
    MULTISTATE_OUTPUT = "multi-state-output"


type BacnetWritePriority = Annotated[int, Field(ge=5, le=16)]
