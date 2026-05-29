from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.dependencies import get_device_manager, require_permission
from api.permissions import Permission
from devices_manager import DevicesServiceInterface
from devices_manager.dto import FaultView
from models.types import Severity

router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_faults(
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    severity: Severity | None = Query(None),
    device_id: str | None = Query(None),
) -> list[FaultView]:
    return dm.list_active_faults(severity=severity, device_id=device_id)
