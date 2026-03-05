from __future__ import annotations

from models.pagination import Page

from api.schemas.pagination import (
    build_pagination_links,
    to_paginated_response,
)


class TestBuildPaginationLinks:
    def test_first_page(self):
        page = Page(items=[1, 2], total=10, page=1, size=2)
        links = build_pagination_links("http://example.com/commands", page)
        assert "page=1" in links.self_link
        assert "size=2" in links.self_link
        assert "page=1" in links.first
        assert "page=5" in links.last
        assert links.next is not None
        assert "page=2" in links.next
        assert links.prev is None

    def test_middle_page(self):
        page = Page(items=[1, 2], total=10, page=3, size=2)
        links = build_pagination_links("http://example.com/commands", page)
        assert "page=3" in links.self_link
        assert links.next is not None
        assert "page=4" in links.next
        assert links.prev is not None
        assert "page=2" in links.prev

    def test_last_page(self):
        page = Page(items=[1], total=5, page=3, size=2)
        links = build_pagination_links("http://example.com/commands", page)
        assert "page=3" in links.self_link
        assert links.next is None
        assert links.prev is not None
        assert "page=2" in links.prev

    def test_single_page(self):
        page = Page(items=[1, 2], total=2, page=1, size=10)
        links = build_pagination_links("http://example.com/commands", page)
        assert links.next is None
        assert links.prev is None

    def test_preserves_existing_query_params(self):
        page = Page(items=[], total=0, page=1, size=10)
        links = build_pagination_links(
            "http://example.com/commands?device_id=d1&attribute=temp", page
        )
        assert "device_id=d1" in links.self_link
        assert "attribute=temp" in links.self_link
        assert "page=1" in links.self_link

    def test_empty_results(self):
        page = Page(items=[], total=0, page=1, size=50)
        links = build_pagination_links("http://example.com/commands", page)
        assert "page=1" in links.last
        assert links.next is None
        assert links.prev is None


class TestToPaginatedResponse:
    def test_basic(self):
        page = Page(items=["a", "b"], total=5, page=1, size=2)
        response = to_paginated_response(page, "http://example.com/commands")
        assert response.items == ["a", "b"]
        assert response.total == 5
        assert response.page == 1
        assert response.size == 2
        assert response.total_pages == 3
        assert response.links.self_link is not None

    def test_serialization_alias(self):
        page = Page(items=[], total=0, page=1, size=10)
        response = to_paginated_response(page, "http://example.com/commands")
        data = response.model_dump(by_alias=True)
        assert "self" in data["links"]
        assert "self_link" not in data["links"]
