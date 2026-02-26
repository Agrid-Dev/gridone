import asyncio
from pathlib import Path

import yaml

from users.authorization_models import Permission, Role, UserRoleAssignment


class YamlAuthorizationStorage:
    """File-based YAML storage for roles and user role assignments."""

    _roles_path: Path
    _assignments_path: Path
    _file_extension = ".yaml"

    def __init__(self, root_path: Path | str) -> None:
        self._roles_path = Path(root_path) / "roles"
        self._assignments_path = Path(root_path) / "role_assignments"
        self._roles_path.mkdir(parents=True, exist_ok=True)
        self._assignments_path.mkdir(parents=True, exist_ok=True)

    # ── Helpers ────────────────────────────────────────────────────────

    def _role_file(self, role_id: str) -> Path:
        return self._roles_path / (role_id + self._file_extension)

    def _assignment_file(self, assignment_id: str) -> Path:
        return self._assignments_path / (assignment_id + self._file_extension)

    @staticmethod
    def _parse_role(data: dict) -> Role:
        perms = []
        for p in data.get("permissions", []):
            try:
                perms.append(Permission(p))
            except ValueError:
                pass
        return Role(
            id=data["id"],
            name=data["name"],
            description=data.get("description", ""),
            is_system=data.get("is_system", False),
            permissions=perms,
        )

    @staticmethod
    def _parse_assignment(data: dict) -> UserRoleAssignment:
        return UserRoleAssignment(
            id=data["id"],
            user_id=data["user_id"],
            role_id=data["role_id"],
            asset_id=data["asset_id"],
        )

    # ── Roles ─────────────────────────────────────────────────────────

    def _read_role_sync(self, role_id: str) -> Role | None:
        path = self._role_file(role_id)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return self._parse_role(data)

    def _read_all_roles_sync(self) -> list[Role]:
        result = []
        for file in sorted(self._roles_path.iterdir()):
            if file.is_file() and file.suffix == self._file_extension:
                with file.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                result.append(self._parse_role(data))
        return result

    def _write_role_sync(self, role: Role) -> None:
        path = self._role_file(role.id)
        data = role.model_dump(mode="json")
        data["permissions"] = [str(p) for p in role.permissions]
        with path.open("w", encoding="utf-8") as f:
            yaml.dump(data, f)

    def _delete_role_sync(self, role_id: str) -> None:
        path = self._role_file(role_id)
        if path.exists():
            path.unlink()
        # Also delete all assignments referencing this role
        for file in sorted(self._assignments_path.iterdir()):
            if file.is_file() and file.suffix == self._file_extension:
                with file.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data.get("role_id") == role_id:
                    file.unlink()

    async def get_role_by_id(self, role_id: str) -> Role | None:
        return await asyncio.to_thread(self._read_role_sync, role_id)

    async def get_role_by_name(self, name: str) -> Role | None:
        roles = await asyncio.to_thread(self._read_all_roles_sync)
        for role in roles:
            if role.name == name:
                return role
        return None

    async def list_roles(self) -> list[Role]:
        return await asyncio.to_thread(self._read_all_roles_sync)

    async def save_role(self, role: Role) -> None:
        await asyncio.to_thread(self._write_role_sync, role)

    async def delete_role(self, role_id: str) -> None:
        await asyncio.to_thread(self._delete_role_sync, role_id)

    # ── User role assignments ─────────────────────────────────────────

    def _read_assignment_sync(self, assignment_id: str) -> UserRoleAssignment | None:
        path = self._assignment_file(assignment_id)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return self._parse_assignment(data)

    def _read_all_assignments_sync(self) -> list[UserRoleAssignment]:
        result = []
        for file in sorted(self._assignments_path.iterdir()):
            if file.is_file() and file.suffix == self._file_extension:
                with file.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                result.append(self._parse_assignment(data))
        return result

    def _write_assignment_sync(self, assignment: UserRoleAssignment) -> None:
        path = self._assignment_file(assignment.id)
        with path.open("w", encoding="utf-8") as f:
            yaml.dump(assignment.model_dump(mode="json"), f)

    def _delete_assignment_sync(self, assignment_id: str) -> None:
        path = self._assignment_file(assignment_id)
        if path.exists():
            path.unlink()

    async def get_assignment_by_id(
        self, assignment_id: str
    ) -> UserRoleAssignment | None:
        return await asyncio.to_thread(self._read_assignment_sync, assignment_id)

    async def list_assignments_for_user(
        self, user_id: str
    ) -> list[UserRoleAssignment]:
        all_assignments = await asyncio.to_thread(self._read_all_assignments_sync)
        return [a for a in all_assignments if a.user_id == user_id]

    async def list_assignments_for_role(
        self, role_id: str
    ) -> list[UserRoleAssignment]:
        all_assignments = await asyncio.to_thread(self._read_all_assignments_sync)
        return [a for a in all_assignments if a.role_id == role_id]

    async def list_all_assignments(self) -> list[UserRoleAssignment]:
        return await asyncio.to_thread(self._read_all_assignments_sync)

    async def save_assignment(self, assignment: UserRoleAssignment) -> None:
        await asyncio.to_thread(self._write_assignment_sync, assignment)

    async def delete_assignment(self, assignment_id: str) -> None:
        await asyncio.to_thread(self._delete_assignment_sync, assignment_id)

    async def delete_assignments_for_user(self, user_id: str) -> None:
        all_assignments = await asyncio.to_thread(self._read_all_assignments_sync)
        for a in all_assignments:
            if a.user_id == user_id:
                await asyncio.to_thread(self._delete_assignment_sync, a.id)

    def _update_null_asset_ids_sync(self, root_asset_id: str) -> None:
        for file in sorted(self._assignments_path.iterdir()):
            if file.is_file() and file.suffix == self._file_extension:
                with file.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data.get("asset_id") is None:
                    data["asset_id"] = root_asset_id
                    with file.open("w", encoding="utf-8") as f:
                        yaml.dump(data, f)

    async def update_null_asset_ids(self, root_asset_id: str) -> None:
        await asyncio.to_thread(self._update_null_asset_ids_sync, root_asset_id)
