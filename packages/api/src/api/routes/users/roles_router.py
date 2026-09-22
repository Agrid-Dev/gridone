from typing import Annotated

from fastapi import APIRouter, Depends

from api.auth import require_permission
from api.dependencies import get_users_service
from users import Role, UsersService
from users.permissions import Permission

router = APIRouter()


# Both spellings are registered: the slashless one would otherwise fall through
# to users_router's GET /users/{user_id}, which matches before any redirect.
@router.get("/", dependencies=[Depends(require_permission(Permission.ROLES_READ))])
@router.get(
    "",
    include_in_schema=False,
    dependencies=[Depends(require_permission(Permission.ROLES_READ))],
)
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
