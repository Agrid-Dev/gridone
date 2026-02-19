from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from users.auth import get_current_user_id, get_users_manager
from users import User, UsersManager

router = APIRouter()


class UserCreateRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    name: str = ""
    email: str = ""
    title: str = ""


class UserUpdateRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    is_admin: bool | None = None
    name: str | None = None
    email: str | None = None
    title: str | None = None


@router.get("/", response_model=list[User])
async def list_users(
    _: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> list[User]:
    return await um.list_users()


@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateRequest,
    _: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.create_user(
            username=body.username,
            password=body.password,
            is_admin=body.is_admin,
            name=body.name,
            email=body.email,
            title=body.title,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/{user_id}", response_model=User)
async def get_user(
    user_id: str,
    _: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    user = await um.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return User.model_validate(user.model_dump())


@router.patch("/{user_id}", response_model=User)
async def update_user(
    user_id: str,
    body: UserUpdateRequest,
    _: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.update_user(
            user_id,
            username=body.username,
            password=body.password,
            is_admin=body.is_admin,
            name=body.name,
            email=body.email,
            title=body.title,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
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
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
