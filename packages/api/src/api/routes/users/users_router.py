from typing import Annotated

from models.errors import NotFoundError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StringConstraints

from users import Role, User, UserCreate, UserType, UserUpdate, UsersManager
from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
)
from users.auth import TokenPayload
from users.models import Role as RoleEnum

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_users_manager,
    require_permission,
)
from api.permissions import Permission, get_permissions_for_role

router = APIRouter()

UsernameField = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
    ),
]
PasswordField = Annotated[
    str,
    StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH),
]


class UserBasic(BaseModel):
    id: str
    name: str


def _make_display_name(name: str) -> str:
    """Return 'First L.' from a full name, or the name as-is if single word / empty."""
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1][0]}."
    return name


class UserCreateRequest(BaseModel):
    username: UsernameField
    password: PasswordField
    role: Role = Role.OPERATOR
    type: UserType = UserType.USER
    name: str = ""
    email: str = ""
    title: str = ""


class UserUpdateRequest(BaseModel):
    username: UsernameField | None = None
    password: PasswordField | None = None
    role: Role | None = None
    name: str | None = None
    email: str | None = None
    title: str | None = None


@router.get("/")
async def list_users(
    payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> list[User] | list[UserBasic]:
    perms = get_permissions_for_role(RoleEnum(payload.role))
    if Permission.USERS_READ in perms:
        return await um.list_users()
    if Permission.USERS_READ_BASIC in perms:
        users = await um.list_users()
        return [UserBasic(id=u.id, name=_make_display_name(u.name)) for u in users]
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission denied: requires {Permission.USERS_READ}",
    )


@router.post(
    "/",
    response_model=User,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def create_user(
    body: UserCreateRequest,
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.create_user(
            UserCreate(
                username=body.username,
                password=body.password,
                role=body.role,
                type=body.type,
                name=body.name,
                email=body.email,
                title=body.title,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get(
    "/{user_id}",
    response_model=User,
    dependencies=[Depends(require_permission(Permission.USERS_READ))],
)
async def get_user(
    user_id: str,
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.get_by_id(user_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.patch(
    "/{user_id}",
    response_model=User,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def update_user(
    user_id: str,
    body: UserUpdateRequest,
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.update_user(
            user_id,
            UserUpdate(
                username=body.username,
                password=body.password,
                role=body.role,
                name=body.name,
                email=body.email,
                title=body.title,
            ),
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def delete_user(
    user_id: str,
    current_user_id: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> None:
    if user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )
    try:
        await um.delete_user(user_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post(
    "/{user_id}/block",
    response_model=User,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def block_user(
    user_id: str,
    current_user_id: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    if user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot block your own account",
        )
    return await um.block_user(user_id)


@router.post(
    "/{user_id}/unblock",
    response_model=User,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def unblock_user(
    user_id: str,
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    return await um.unblock_user(user_id)
