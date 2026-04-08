from pydantic import BaseModel

HOST_PATTERN = r"^[^\s:/]+(\.[^\s:/]+)*$"


class BaseTransportConfig(BaseModel):
    pass
