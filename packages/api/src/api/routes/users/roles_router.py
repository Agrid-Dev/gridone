from typing import Annotated

from fastapi import APIRouter, Depends

from api.auth import require_permission
from api.dependencies import get_users_service
from users import Role, UsersService
from users.permissions import Permission

router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission(Permission.ROLES_READ))])
async def list_roles(
    um: Annotated[UsersService, Depends(get_users_service)],
) -> list[Role]:
    return await um.list_roles()


@router.get(
    "/{role_id}",
    dependencies=[Depends(require_permission(Permission.ROLES_READ))],
)
async def get_role(
    role_id: str,
    um: Annotated[UsersService, Depends(get_users_service)],
) -> Role:
    # NotFoundError -> 404 is handled by exception_handlers.py
    return await um.get_role(role_id)
