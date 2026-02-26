from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from models.errors import NotFoundError
from users import (
    ALL_PERMISSIONS,
    Permission,
    Role,
    RoleCreate,
    RoleUpdate,
    UserRoleAssignment,
    UserRoleAssignmentCreate,
)
from users.roles_manager import RolesManager

from api.dependencies import get_roles_manager, require_permission

router = APIRouter()

_read = Depends(require_permission(Permission.ROLES_READ))
_manage = Depends(require_permission(Permission.ROLES_MANAGE))


# ── Permissions catalogue ─────────────────────────────────────────────


@router.get("/permissions/")
async def list_permissions(
    _: Annotated[str, _read],
) -> list[str]:
    """Return the list of all defined permission strings."""
    return [str(p) for p in ALL_PERMISSIONS]


# ── Roles ─────────────────────────────────────────────────────────────


@router.get("/", response_model=list[Role])
async def list_roles(
    _: Annotated[str, _read],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> list[Role]:
    return await rm.list_roles()


@router.get("/{role_id}", response_model=Role)
async def get_role(
    role_id: str,
    _: Annotated[str, _read],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> Role:
    return await rm.get_role(role_id)


@router.post("/", response_model=Role, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    _: Annotated[str, _manage],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> Role:
    try:
        return await rm.create_role(body)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(e)
        ) from e


@router.patch("/{role_id}", response_model=Role)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    _: Annotated[str, _manage],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> Role:
    try:
        return await rm.update_role(role_id, body)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(e)
        ) from e


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    _: Annotated[str, _manage],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> None:
    try:
        await rm.delete_role(role_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(e)
        ) from e


# ── Assignments ───────────────────────────────────────────────────────


@router.get("/assignments/", response_model=list[UserRoleAssignment])
async def list_assignments(
    _: Annotated[str, _read],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
    user_id: str | None = Query(None),
    role_id: str | None = Query(None),
) -> list[UserRoleAssignment]:
    return await rm.list_assignments(user_id=user_id, role_id=role_id)


@router.post(
    "/assignments/",
    response_model=UserRoleAssignment,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment(
    body: UserRoleAssignmentCreate,
    _: Annotated[str, _manage],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> UserRoleAssignment:
    try:
        return await rm.create_assignment(body)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
        ) from e


@router.delete(
    "/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_assignment(
    assignment_id: str,
    _: Annotated[str, _manage],
    rm: Annotated[RolesManager, Depends(get_roles_manager)],
) -> None:
    await rm.delete_assignment(assignment_id)
