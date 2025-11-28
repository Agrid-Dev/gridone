from enum import StrEnum
from typing import Annotated

from pydantic import Field


class BacnetObjectType(StrEnum):
    """Object type enumeration using values as in bacpypes 3.
    Not exhaustive."""

    BINARY_VALUE = "binary-value"
    BINARY_INPUT = "binary-input"
    ANALOG_VALUE = "analog-value"
    ANALOG_INPUT = "analog-input"
    MULTISTATE_VALUE = "multistate-value"
    MULTISTATE_INPUT = "multistate-input"


type BacnetWritePriority = Annotated[int, Field(ge=5, le=16)]
