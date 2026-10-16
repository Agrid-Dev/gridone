from fastapi import APIRouter, Depends

from api.auth import require_device_read
from devices_manager.dto.presentation_schema import (
    PresentationSchema,
    presentation_schema,
)

router = APIRouter()


@router.get("/schema", dependencies=[Depends(require_device_read)])
def get_presentation_schema() -> PresentationSchema:
    return presentation_schema()
