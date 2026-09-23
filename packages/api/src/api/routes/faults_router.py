from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.access import ScopedDeviceReads
from api.access.dependencies import get_device_reads
from api.auth import require_permission
from devices_manager.dto import FaultView
from models.types import Severity
from users.permissions import Permission

router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_faults(
    reads: Annotated[ScopedDeviceReads, Depends(get_device_reads)],
    severity: Severity | None = Query(None),
    device_id: str | None = Query(None),
) -> list[FaultView]:
    return reads.list_faults(severity=severity, device_id=device_id)
