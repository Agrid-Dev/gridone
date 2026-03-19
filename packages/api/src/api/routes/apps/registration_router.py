from typing import Annotated

from apps import (
    App,
    AppsManager,
    RegistrationRequest,
    RegistrationRequestCreate,
    RegistrationRequestsManager,
)
from fastapi import APIRouter, Depends, HTTPException, status
from models.errors import InvalidError, NotFoundError
from pydantic import BaseModel
from users import User
from users.validation import PasswordField, UsernameField

from api.dependencies import (
    get_apps_manager,
    get_registration_requests_manager,
    require_permission,
)
from api.permissions import Permission

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


class AppResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: str
    api_url: str
    health_url: str
    icon: str
    status: str
    created_at: str


def _to_app_response(app: App) -> AppResponse:
    return AppResponse(
        id=app.id,
        user_id=app.user_id,
        name=app.name,
        description=app.description,
        api_url=app.api_url,
        health_url=app.health_url,
        icon=app.icon,
        status=app.status,
        created_at=app.created_at.isoformat(),
    )


class AcceptRegistrationResponse(BaseModel):
    request: RegistrationRequestResponse
    user: User
    app: AppResponse


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
    response_model=RegistrationRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_registration_request(
    body: RegistrationRequestCreateBody,
    rrm: Annotated[
        RegistrationRequestsManager, Depends(get_registration_requests_manager)
    ],
) -> RegistrationRequestResponse:
    try:
        req = await rrm.create_registration_request(
            RegistrationRequestCreate(
                username=body.username,
                password=body.password,
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
    rrm: Annotated[
        RegistrationRequestsManager, Depends(get_registration_requests_manager)
    ],
) -> list[RegistrationRequestResponse]:
    requests = await rrm.list_registration_requests()
    return [_to_response(r) for r in requests]


@router.get(
    "/registration-requests/{request_id}",
    response_model=RegistrationRequestResponse,
)
async def get_registration_request(
    request_id: str,
    rrm: Annotated[
        RegistrationRequestsManager, Depends(get_registration_requests_manager)
    ],
) -> RegistrationRequestResponse:
    try:
        req = await rrm.get_registration_request(request_id)
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
    rrm: Annotated[
        RegistrationRequestsManager, Depends(get_registration_requests_manager)
    ],
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> AcceptRegistrationResponse:
    try:
        req = await rrm.accept_registration_request(request_id)
        user, app = await am.create_app(
            username=req.username,
            hashed_password=req.hashed_password,
            config=req.config,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except InvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return AcceptRegistrationResponse(
        request=_to_response(req), user=user, app=_to_app_response(app)
    )


@router.post(
    "/registration-requests/{request_id}/discard",
    response_model=RegistrationRequestResponse,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def discard_registration_request(
    request_id: str,
    rrm: Annotated[
        RegistrationRequestsManager, Depends(get_registration_requests_manager)
    ],
) -> RegistrationRequestResponse:
    try:
        req = await rrm.discard_registration_request(request_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except InvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    return _to_response(req)
