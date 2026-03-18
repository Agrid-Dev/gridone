from typing import Annotated

from apps import (
    AppsManager,
    RegistrationRequest,
    RegistrationRequestCreate,
    RegistrationRequestType,
)
from fastapi import APIRouter, Depends, HTTPException, status
from models.errors import InvalidError, NotFoundError
from pydantic import BaseModel
from users import User, UsersManager
from users.validation import PasswordField, UsernameField

from api.dependencies import get_apps_manager, get_users_manager, require_permission
from api.permissions import Permission

router = APIRouter()


class RegistrationRequestCreateBody(BaseModel):
    username: UsernameField
    password: PasswordField
    type: RegistrationRequestType = RegistrationRequestType.USER
    config: str = ""


class RegistrationRequestResponse(BaseModel):
    id: str
    username: str
    type: RegistrationRequestType
    status: str
    created_at: str
    config: str


class AcceptRegistrationResponse(BaseModel):
    request: RegistrationRequestResponse
    user: User


def _to_response(req: RegistrationRequest) -> RegistrationRequestResponse:
    return RegistrationRequestResponse(
        id=req.id,
        username=req.username,
        type=req.type,
        status=req.status,
        created_at=req.created_at.isoformat(),
        config=req.config,
    )


@router.post(
    "/registration-requests",
    response_model=RegistrationRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_registration_request(
    body: RegistrationRequestCreateBody,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> RegistrationRequestResponse:
    try:
        req = await am.create_registration_request(
            RegistrationRequestCreate(
                username=body.username,
                password=body.password,
                type=body.type,
                config=body.config,
            )
        )
    except InvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    return _to_response(req)


@router.get(
    "/registration-requests",
    response_model=list[RegistrationRequestResponse],
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def list_registration_requests(
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> list[RegistrationRequestResponse]:
    requests = await am.list_registration_requests()
    return [_to_response(r) for r in requests]


@router.get(
    "/registration-requests/{request_id}",
    response_model=RegistrationRequestResponse,
)
async def get_registration_request(
    request_id: str,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> RegistrationRequestResponse:
    try:
        req = await am.get_registration_request(request_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _to_response(req)


@router.post(
    "/registration-requests/{request_id}/accept",
    response_model=AcceptRegistrationResponse,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def accept_registration_request(
    request_id: str,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> AcceptRegistrationResponse:
    try:
        req, user = await am.accept_registration_request(request_id, um)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except InvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return AcceptRegistrationResponse(request=_to_response(req), user=user)


@router.post(
    "/registration-requests/{request_id}/discard",
    response_model=RegistrationRequestResponse,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def discard_registration_request(
    request_id: str,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> RegistrationRequestResponse:
    try:
        req = await am.discard_registration_request(request_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except InvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    return _to_response(req)
