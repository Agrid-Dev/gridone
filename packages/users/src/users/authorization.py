from __future__ import annotations

from typing import Protocol

from users.authorization_models import Permission
from users.storage.authorization_storage_backend import AuthorizationStorageBackend


class AssetHierarchyProvider(Protocol):
    """Abstraction over the asset tree, implemented by the API layer."""

    async def get_ancestor_ids(self, asset_id: str) -> list[str]:
        """Return ordered list [asset_id, parent_id, ..., root_id]."""
        ...

    async def get_descendant_ids(self, asset_id: str) -> list[str]:
        """Return all descendant asset IDs (excluding the given asset_id)."""
        ...

    async def get_asset_ids_for_device(self, device_id: str) -> list[str]:
        """Return asset IDs that a device is linked to."""
        ...

    async def get_root_asset_ids(self) -> list[str]:
        """Return the IDs of root assets (those with no parent)."""
        ...


class AuthorizationService:
    """Evaluates RBAC permissions with hierarchical resource scoping."""

    def __init__(
        self,
        storage: AuthorizationStorageBackend,
        asset_hierarchy: AssetHierarchyProvider | None = None,
    ) -> None:
        self._storage = storage
        self._asset_hierarchy = asset_hierarchy

    # ── Core permission resolution ────────────────────────────────────

    async def get_user_permissions(
        self,
        user_id: str,
        asset_id: str | None = None,
    ) -> set[Permission]:
        """Compute the effective permissions for a user.

        If *asset_id* is provided, includes permissions from roles assigned
        to this asset or any of its ancestors (bubble-up).
        If *asset_id* is None (unscoped check), aggregates permissions from
        ALL the user's role assignments regardless of asset scope.
        """
        assignments = await self._storage.list_assignments_for_user(user_id)

        if asset_id is None:
            # Unscoped: collect all permissions the user has on any asset
            permissions: set[Permission] = set()
            for assignment in assignments:
                role = await self._storage.get_role_by_id(assignment.role_id)
                if role is not None:
                    permissions.update(role.permissions)
            return permissions

        # Scoped: bubble-up from asset to root
        if self._asset_hierarchy is not None:
            ancestors = await self._asset_hierarchy.get_ancestor_ids(asset_id)
            scope_asset_ids: set[str] = set(ancestors)
        else:
            scope_asset_ids = {asset_id}

        permissions = set()
        for assignment in assignments:
            if assignment.asset_id in scope_asset_ids:
                role = await self._storage.get_role_by_id(assignment.role_id)
                if role is not None:
                    permissions.update(role.permissions)

        return permissions

    async def check_permission(
        self,
        user_id: str,
        permission: Permission,
        asset_id: str | None = None,
    ) -> bool:
        """Check if user has a specific permission, optionally scoped to an asset."""
        perms = await self.get_user_permissions(user_id, asset_id)
        return permission in perms

    # ── Scope resolution (for list endpoints) ─────────────────────────

    async def get_accessible_asset_ids(
        self,
        user_id: str,
        permission: Permission,
    ) -> set[str] | None:
        """Return the set of asset IDs (including descendants) where the user
        holds the given permission.

        Returns ``None`` if the user has a matching assignment at a root asset
        (effectively unrestricted access).
        """
        assignments = await self._storage.list_assignments_for_user(user_id)

        if self._asset_hierarchy is None:
            return None

        # Optimisation: if any matching assignment is at a root asset, access
        # is unrestricted — no need to enumerate all descendants.
        root_ids = set(await self._asset_hierarchy.get_root_asset_ids())

        accessible: set[str] = set()
        for assignment in assignments:
            role = await self._storage.get_role_by_id(assignment.role_id)
            if role and permission in role.permissions:
                if assignment.asset_id in root_ids:
                    return None  # root-level → unrestricted
                accessible.add(assignment.asset_id)
                descendants = await self._asset_hierarchy.get_descendant_ids(
                    assignment.asset_id
                )
                accessible.update(descendants)

        return accessible

    # ── Device-level checks ───────────────────────────────────────────

    async def check_device_permission(
        self,
        user_id: str,
        permission: Permission,
        device_id: str,
    ) -> bool:
        """Check permission for a device by resolving its linked assets."""
        if self._asset_hierarchy is None:
            return await self.check_permission(user_id, permission)

        asset_ids = await self._asset_hierarchy.get_asset_ids_for_device(device_id)
        if not asset_ids:
            # Device not linked to any asset: fall back to unscoped check
            return await self.check_permission(user_id, permission)

        for aid in asset_ids:
            if await self.check_permission(user_id, permission, aid):
                return True
        return False

    async def filter_device_ids(
        self,
        user_id: str,
        permission: Permission,
        device_ids: list[str],
    ) -> list[str]:
        """Filter a list of device IDs to only those the user can access."""
        accessible_assets = await self.get_accessible_asset_ids(user_id, permission)
        if accessible_assets is None:
            return device_ids  # unrestricted access

        if self._asset_hierarchy is None:
            return device_ids

        result = []
        for did in device_ids:
            asset_ids = await self._asset_hierarchy.get_asset_ids_for_device(did)
            if not asset_ids:
                continue  # unlinked devices hidden from scoped users
            if any(aid in accessible_assets for aid in asset_ids):
                result.append(did)
        return result
