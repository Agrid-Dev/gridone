from typing import Annotated

from models.errors import NotFoundError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from users import AuthorizationService, UsersManager
from users.auth import AuthService
from users.roles_manager import RolesManager
from users.validation import AuthPayload, get_auth_payload_schema
from api.dependencies import (
    get_auth_service,
    get_authorization_service,
    get_current_user_id,
    get_roles_manager,
    get_users_manager,
)

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleAssignmentInfo(BaseModel):
    role_id: str
    role_name: str
    asset_id: str


class MeResponse(BaseModel):
    id: str
    username: str
    name: str
    email: str
    title: str
    must_change_password: bool
    permissions: list[str]
    roles: list[RoleAssignmentInfo]


@router.post("/login", response_model=TokenResponse)
async def login(
    body: AuthPayload,
    um: Annotated[UsersManager, Depends(get_users_manager)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    user = await um.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = auth_service.create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.get("/schema")
async def get_auth_schema() -> dict:
    """JSON schema of AuthPayload for frontend form validation (e.g. z.fromJSONSchema)."""
    return get_auth_payload_schema()


@router.get("/me", response_model=MeResponse)
async def get_me(
    current_user_id: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> MeResponse:
    try:
        user = await um.get_by_id(current_user_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    permissions = await authz.get_user_permissions(current_user_id)
    assignments = await rm.list_assignments(user_id=current_user_id)

    roles_info: list[RoleAssignmentInfo] = []
    for a in assignments:
        role = await rm._storage.get_role_by_id(a.role_id)
        if role:
            roles_info.append(
                RoleAssignmentInfo(
                    role_id=a.role_id,
                    role_name=role.name,
                    asset_id=a.asset_id,
                )
            )

    return MeResponse(
        id=user.id,
        username=user.username,
        name=user.name,
        email=user.email,
        title=user.title,
        must_change_password=user.must_change_password,
        permissions=[str(p) for p in sorted(permissions)],
        roles=roles_info,
    )
