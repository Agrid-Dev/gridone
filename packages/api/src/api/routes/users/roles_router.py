from typing import Annotated

from fastapi import APIRouter, Depends, status

from api.auth import require_permission
from api.dependencies import get_users_service
from users import Role, RoleCreate, RoleUpdate, UsersService
from users.permissions import Permission

router = APIRouter()

_read = [Depends(require_permission(Permission.ROLES_READ))]
_write = [Depends(require_permission(Permission.ROLES_WRITE))]


# Both spellings are registered: the slashless one would otherwise fall through
# to users_router's GET /users/{user_id}, which matches before any redirect.
@router.get("/", dependencies=_read)
@router.get("", include_in_schema=False, dependencies=_read)
async def list_roles(
    um: Annotated[UsersService, Depends(get_users_service)],
) -> list[Role]:
    return await um.list_roles()


@router.get("/{role_id}", dependencies=_read)
async def get_role(
    role_id: str,
    um: Annotated[UsersService, Depends(get_users_service)],
) -> Role:
    # NotFoundError -> 404 is handled by exception_handlers.py
    return await um.get_role(role_id)


@router.post("/", status_code=status.HTTP_201_CREATED, dependencies=_write)
@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
    dependencies=_write,
)
async def create_role(
    body: RoleCreate,
    um: Annotated[UsersService, Depends(get_users_service)],
) -> Role:
    # ConflictError -> 409 (duplicate or built-in id) is handled by
    # exception_handlers.py; an invalid scope or an unknown permission is a
    # 422 from the DTO itself.
    return await um.create_role(body)


@router.patch("/{role_id}", dependencies=_write)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    um: Annotated[UsersService, Depends(get_users_service)],
) -> Role:
    # ConflictError -> 409 (built-in), NotFoundError -> 404
    return await um.update_role(role_id, body)


@router.delete(
    "/{role_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_write
)
async def delete_role(
    role_id: str,
    um: Annotated[UsersService, Depends(get_users_service)],
) -> None:
    # ConflictError -> 409 (built-in, or still assigned), NotFoundError -> 404
    await um.delete_role(role_id)
