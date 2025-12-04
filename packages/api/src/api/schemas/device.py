from pydantic import BaseModel


class Device(BaseModel):
    id: str
    config: dict[str, str | int | float]
    driver: str
