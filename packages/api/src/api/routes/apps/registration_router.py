from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.dependencies import get_apps_service, require_permission
from api.permissions import Permission
from apps import AppsService, RegistrationRequest, RegistrationRequestCreate
from models.errors import InvalidError
from users.validation import PasswordField, UsernameField

router = APIRouter()


class RegistrationRequestCreateBody(BaseModel):
    username: UsernameField
    password: PasswordField
    config: str = ""


class RegistrationRequestResponse(BaseModel):
    id: str
    username: str
    status: str
    created_at: str
    config: str


def _to_response(req: RegistrationRequest) -> RegistrationRequestResponse:
    return RegistrationRequestResponse(
        id=req.id,
        username=req.username,
        status=req.status,
        created_at=req.created_at.isoformat(),
        config=req.config,
    )


@router.post(
    "/registration-requests",
    status_code=status.HTTP_201_CREATED,
)
async def create_registration_request(
    body: RegistrationRequestCreateBody,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> RegistrationRequestResponse:
    req = await service.create_registration_request(
        RegistrationRequestCreate(
            username=body.username,
            password=body.password,
            config=body.config,
        )
    )
    return _to_response(req)


@router.get(
    "/registration-requests",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def list_registration_requests(
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> list[RegistrationRequestResponse]:
    requests = await service.list_registration_requests()
    return [_to_response(r) for r in requests]


@router.get(
    "/registration-requests/{request_id}",
)
async def get_registration_request(
    request_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> RegistrationRequestResponse:
    req = await service.get_registration_request(request_id)
    return _to_response(req)


@router.post(
    "/registration-requests/{request_id}/accept",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def accept_registration_request(
    request_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> RegistrationRequestResponse:
    try:
        req, _user, _app = await service.accept_registration_request(request_id)
    except InvalidError:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return _to_response(req)


@router.post(
    "/registration-requests/{request_id}/discard",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def discard_registration_request(
    request_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> RegistrationRequestResponse:
    req = await service.discard_registration_request(request_id)
    return _to_response(req)
