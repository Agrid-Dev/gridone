from fastapi import APIRouter, Depends

from api.auth import require_permission
from api.permissions import Permission
from devices_manager.dto.presentation_schema import (
    PresentationSchema,
    presentation_schema,
)

router = APIRouter()


@router.get(
    "/schema", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
def get_presentation_schema() -> PresentationSchema:
    return presentation_schema()
