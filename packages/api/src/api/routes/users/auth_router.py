from typing import Annotated

from models.errors import NotFoundError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from users import User, UsersManager
from users.auth import AuthService
from users.validation import AuthPayload, get_auth_payload_schema
from api.dependencies import (
    get_auth_service,
    get_current_user_id,
    get_users_manager,
)

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


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


@router.get("/me", response_model=User)
async def get_me(
    current_user_id: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> User:
    try:
        return await um.get_by_id(current_user_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
