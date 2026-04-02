from __future__ import annotations

import pytest

from models.errors import InvalidError
from models.pagination import Page, PaginationParams


class TestPaginationParams:
    def test_defaults(self):
        params = PaginationParams()
        assert params.page == 1
        assert params.size == 50

    def test_custom_values(self):
        params = PaginationParams(page=3, size=20)
        assert params.page == 3
        assert params.size == 20

    def test_offset(self):
        assert PaginationParams(page=1, size=10).offset == 0
        assert PaginationParams(page=2, size=10).offset == 10
        assert PaginationParams(page=3, size=25).offset == 50

    def test_limit(self):
        assert PaginationParams(page=1, size=10).limit == 10
        assert PaginationParams(page=2, size=50).limit == 50

    def test_page_zero_raises(self):
        with pytest.raises(InvalidError, match="page must be >= 1"):
            PaginationParams(page=0)

    def test_negative_page_raises(self):
        with pytest.raises(InvalidError, match="page must be >= 1"):
            PaginationParams(page=-1)

    def test_size_zero_raises(self):
        with pytest.raises(InvalidError, match="size must be between 1 and 200"):
            PaginationParams(size=0)

    def test_size_over_max_raises(self):
        with pytest.raises(InvalidError, match="size must be between 1 and 200"):
            PaginationParams(size=201)

    def test_size_at_boundaries(self):
        PaginationParams(size=1)
        PaginationParams(size=200)

    def test_frozen(self):
        params = PaginationParams()
        with pytest.raises(AttributeError):
            params.page = 2  # type: ignore[misc]


class TestPage:
    def test_basic(self):
        page = Page(items=[1, 2, 3], total=10, page=1, size=3)
        assert page.items == [1, 2, 3]
        assert page.total == 10
        assert page.page == 1
        assert page.size == 3

    def test_total_pages(self):
        assert Page(items=[], total=10, page=1, size=3).total_pages == 4
        assert Page(items=[], total=9, page=1, size=3).total_pages == 3
        assert Page(items=[], total=1, page=1, size=10).total_pages == 1

    def test_total_pages_empty(self):
        assert Page(items=[], total=0, page=1, size=10).total_pages == 0

    def test_has_next(self):
        assert Page(items=[1], total=10, page=1, size=5).has_next is True
        assert Page(items=[1], total=10, page=2, size=5).has_next is False

    def test_has_prev(self):
        assert Page(items=[1], total=10, page=1, size=5).has_prev is False
        assert Page(items=[1], total=10, page=2, size=5).has_prev is True

    def test_single_page(self):
        page = Page(items=[1, 2], total=2, page=1, size=10)
        assert page.total_pages == 1
        assert page.has_next is False
        assert page.has_prev is False

    def test_frozen(self):
        page = Page(items=[], total=0, page=1, size=10)
        with pytest.raises(AttributeError):
            page.total = 5  # type: ignore[misc]
