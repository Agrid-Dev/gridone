import uuid

from models.errors import NotFoundError

from users.authorization_models import (
    ALL_PERMISSIONS,
    Permission,
    Role,
    RoleCreate,
    RoleUpdate,
    UserRoleAssignment,
    UserRoleAssignmentCreate,
)
from users.storage.authorization_storage_backend import AuthorizationStorageBackend

SYSTEM_ROLES: list[dict] = [
    {
        "name": "admin",
        "description": "Full access to all resources",
        "permissions": ALL_PERMISSIONS,
    },
    {
        "name": "operator",
        "description": "Can read and command devices",
        "permissions": [
            Permission.DEVICES_READ,
            Permission.DEVICES_COMMAND,
            Permission.DRIVERS_READ,
            Permission.TRANSPORTS_READ,
            Permission.TIMESERIES_READ,
            Permission.ASSETS_READ,
        ],
    },
    {
        "name": "viewer",
        "description": "Read-only access",
        "permissions": [
            Permission.DEVICES_READ,
            Permission.DRIVERS_READ,
            Permission.TRANSPORTS_READ,
            Permission.TIMESERIES_READ,
            Permission.ASSETS_READ,
        ],
    },
]


class RolesManager:
    def __init__(self, storage: AuthorizationStorageBackend) -> None:
        self._storage = storage

    # ── Bootstrap ─────────────────────────────────────────────────────

    async def ensure_default_roles(self) -> None:
        """Seed the built-in system roles, updating permissions on each startup."""
        for role_def in SYSTEM_ROLES:
            existing = await self._storage.get_role_by_name(role_def["name"])
            if existing is None:
                role = Role(
                    id=str(uuid.uuid4()),
                    name=role_def["name"],
                    description=role_def["description"],
                    is_system=True,
                    permissions=role_def["permissions"],
                )
                await self._storage.save_role(role)
            elif existing.is_system:
                # Update permissions to match code definition (allows adding
                # new permissions to system roles on upgrade)
                updated = existing.model_copy(
                    update={"permissions": role_def["permissions"]}
                )
                await self._storage.save_role(updated)

    async def ensure_default_role_assignments(
        self,
        user_ids: list[str],
        root_asset_id: str,
        *,
        admin_user_id: str | None = None,
    ) -> None:
        """Assign a default role at the root asset to users without any
        existing role assignments.

        *admin_user_id* (e.g. the freshly-created default admin) receives the
        admin role; all other users receive the viewer role.
        """
        admin_role = await self._storage.get_role_by_name("admin")
        viewer_role = await self._storage.get_role_by_name("viewer")
        if admin_role is None or viewer_role is None:
            return

        for user_id in user_ids:
            existing = await self._storage.list_assignments_for_user(user_id)
            if existing:
                continue  # already has role assignments
            role = admin_role if user_id == admin_user_id else viewer_role
            assignment = UserRoleAssignment(
                id=str(uuid.uuid4()),
                user_id=user_id,
                role_id=role.id,
                asset_id=root_asset_id,
            )
            await self._storage.save_assignment(assignment)

    async def migrate_null_asset_assignments(self, root_asset_id: str) -> None:
        """Migrate any legacy assignments with asset_id=NULL to use the root asset.

        Operates directly on storage to handle records that predate the
        required asset_id constraint.
        """
        await self._storage.update_null_asset_ids(root_asset_id)

    # ── Role CRUD ─────────────────────────────────────────────────────

    async def list_roles(self) -> list[Role]:
        return await self._storage.list_roles()

    async def get_role(self, role_id: str) -> Role:
        role = await self._storage.get_role_by_id(role_id)
        if role is None:
            msg = f"Role '{role_id}' not found"
            raise NotFoundError(msg)
        return role

    async def create_role(self, data: RoleCreate) -> Role:
        existing = await self._storage.get_role_by_name(data.name)
        if existing is not None:
            msg = f"Role name '{data.name}' already exists"
            raise ValueError(msg)
        role = Role(
            id=str(uuid.uuid4()),
            name=data.name,
            description=data.description,
            is_system=False,
            permissions=data.permissions,
        )
        await self._storage.save_role(role)
        return role

    async def update_role(self, role_id: str, data: RoleUpdate) -> Role:
        role = await self.get_role(role_id)
        if role.is_system:
            msg = "Cannot modify a system role"
            raise ValueError(msg)
        updates: dict = {}
        if data.name is not None:
            conflict = await self._storage.get_role_by_name(data.name)
            if conflict and conflict.id != role_id:
                msg = f"Role name '{data.name}' already exists"
                raise ValueError(msg)
            updates["name"] = data.name
        if data.description is not None:
            updates["description"] = data.description
        if data.permissions is not None:
            updates["permissions"] = data.permissions
        updated = role.model_copy(update=updates)
        await self._storage.save_role(updated)
        return updated

    async def delete_role(self, role_id: str) -> None:
        role = await self.get_role(role_id)
        if role.is_system:
            msg = "Cannot delete a system role"
            raise ValueError(msg)
        await self._storage.delete_role(role_id)

    # ── Assignment CRUD ───────────────────────────────────────────────

    async def list_assignments(
        self,
        *,
        user_id: str | None = None,
        role_id: str | None = None,
    ) -> list[UserRoleAssignment]:
        if user_id is not None:
            return await self._storage.list_assignments_for_user(user_id)
        if role_id is not None:
            return await self._storage.list_assignments_for_role(role_id)
        return await self._storage.list_all_assignments()

    async def create_assignment(
        self, data: UserRoleAssignmentCreate
    ) -> UserRoleAssignment:
        # Validate role exists
        role = await self._storage.get_role_by_id(data.role_id)
        if role is None:
            msg = f"Role '{data.role_id}' not found"
            raise NotFoundError(msg)
        assignment = UserRoleAssignment(
            id=str(uuid.uuid4()),
            user_id=data.user_id,
            role_id=data.role_id,
            asset_id=data.asset_id,
        )
        await self._storage.save_assignment(assignment)
        return assignment

    async def delete_assignment(self, assignment_id: str) -> None:
        existing = await self._storage.get_assignment_by_id(assignment_id)
        if existing is None:
            msg = f"Assignment '{assignment_id}' not found"
            raise NotFoundError(msg)
        await self._storage.delete_assignment(assignment_id)


__all__ = ["RolesManager"]
