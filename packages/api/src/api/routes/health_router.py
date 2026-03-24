import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str | None = None


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(version=os.environ.get("GRIDONE_VERSION"))
