from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from models.pagination import Page


class PaginationLinks(BaseModel):
    self_link: str = Field(serialization_alias="self")
    first: str
    last: str
    next: str | None = None
    prev: str | None = None


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    size: int
    total_pages: int
    links: PaginationLinks


def _build_url(base_url: str, page: int, size: int) -> str:
    parts = urlsplit(base_url)
    params = parse_qs(parts.query, keep_blank_values=True)
    params["page"] = [str(page)]
    params["size"] = [str(size)]
    new_query = urlencode(params, doseq=True)
    return urlunsplit(parts._replace(query=new_query))


def build_pagination_links(base_url: str, page: Page) -> PaginationLinks:
    return PaginationLinks(
        self_link=_build_url(base_url, page.page, page.size),
        first=_build_url(base_url, 1, page.size),
        last=_build_url(base_url, max(page.total_pages, 1), page.size),
        next=_build_url(base_url, page.page + 1, page.size) if page.has_next else None,
        prev=_build_url(base_url, page.page - 1, page.size) if page.has_prev else None,
    )


def to_paginated_response[T](page: Page[T], request_url: str) -> PaginatedResponse[T]:
    links = build_pagination_links(request_url, page)
    return PaginatedResponse(
        items=page.items,
        total=page.total,
        page=page.page,
        size=page.size,
        total_pages=page.total_pages,
        links=links,
    )
