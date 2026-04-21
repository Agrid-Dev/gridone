from __future__ import annotations

from typing import Annotated

from devices_manager import DevicesManagerInterface
from devices_manager.dto import FaultView
from fastapi import APIRouter, Depends, Query
from models.types import Severity

from api.dependencies import get_device_manager, require_permission
from api.permissions import Permission

router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_faults(
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
    severity: Severity | None = Query(None),
    device_id: str | None = Query(None),
) -> list[FaultView]:
    return dm.list_active_faults(severity=severity, device_id=device_id)
