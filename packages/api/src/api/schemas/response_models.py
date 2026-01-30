from typing import Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


type HttpMethod = Literal["GET", "POST", "PUT", "DELETE", "PATCH"]

type RestAction = Literal[
    "self", "create", "read", "update", "delete", "list", "search", "export"
]


class Link(BaseModel):
    href: str
    method: HttpMethod


class ResourceResponse[T](BaseModel):
    data: T
    links: dict[RestAction, Link] = Field(..., serialization_alias="_links")


type RawLinks = dict[RestAction, dict[str, str]]


def build_resource_response(
    data: T,
    links: RawLinks,
) -> ResourceResponse[T]:
    return ResourceResponse[T].model_validate({"data": data, "links": links})
