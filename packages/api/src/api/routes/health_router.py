import os

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.features import enabled_flags

router = APIRouter()


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str | None = None
    flags: list[str] = Field(default_factory=list)


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        version=os.environ.get("GRIDONE_VERSION"),
        flags=enabled_flags(),
    )
