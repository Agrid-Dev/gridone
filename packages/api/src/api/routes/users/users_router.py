from typing import Annotated

from models.errors import NotFoundError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StringConstraints

from users import Permission, User, UserCreate, UserUpdate, UsersManager
from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
)
from api.dependencies import get_users_manager, require_permission

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

_read = Depends(require_permission(Permission.USERS_READ))
_manage = Depends(require_permission(Permission.USERS_MANAGE))


class UserCreateRequest(BaseModel):
    username: UsernameField
    password: PasswordField
    is_admin: bool = False
    name: str = ""
    email: str = ""
    title: str = ""


class UserUpdateRequest(BaseModel):
    username: UsernameField | None = None
    password: PasswordField | None = None
    is_admin: bool | None = None
    name: str | None = None
    email: str | None = None
    title: str | None = None


@router.get("/", response_model=list[User])
async def list_users(
    _: Annotated[str, _read],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> list[User]:
    return await um.list_users()


@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateRequest,
    _: Annotated[str, _manage],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.create_user(
            UserCreate(
                username=body.username,
                password=body.password,
                is_admin=body.is_admin,
                name=body.name,
                email=body.email,
                title=body.title,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/{user_id}", response_model=User)
async def get_user(
    user_id: str,
    _: Annotated[str, _read],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.get_by_id(user_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.patch("/{user_id}", response_model=User)
async def update_user(
    user_id: str,
    body: UserUpdateRequest,
    current_user_id: Annotated[str, _manage],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.update_user(
            user_id,
            UserUpdate(
                username=body.username,
                password=body.password,
                is_admin=body.is_admin,
                name=body.name,
                email=body.email,
                title=body.title,
            ),
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_user_id: Annotated[str, _manage],
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
