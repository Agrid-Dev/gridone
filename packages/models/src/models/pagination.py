import math
from dataclasses import dataclass

from models.errors import InvalidError

MAX_PAGE_SIZE = 200


@dataclass(frozen=True)
class PaginationParams:
    page: int = 1
    size: int = 50

    def __post_init__(self) -> None:
        if self.page < 1:
            msg = "page must be >= 1"
            raise InvalidError(msg)
        if self.size < 1 or self.size > MAX_PAGE_SIZE:
            msg = f"size must be between 1 and {MAX_PAGE_SIZE}"
            raise InvalidError(msg)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size

    @property
    def limit(self) -> int:
        return self.size


@dataclass(frozen=True)
class Page[T]:
    items: list[T]
    total: int
    page: int
    size: int

    @property
    def total_pages(self) -> int:
        if self.total == 0:
            return 0
        return math.ceil(self.total / self.size)

    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @property
    def has_prev(self) -> bool:
        return self.page > 1
