import asyncio
from pathlib import Path

import yaml

from users.models import UserInDB


class YamlUsersStorage:
    """File-based YAML storage for users."""

    _root_path: Path
    _file_extension = ".yaml"

    def __init__(self, root_path: Path | str) -> None:
        self._root_path = Path(root_path)
        self._root_path.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, user_id: str) -> Path:
        return self._root_path / (user_id + self._file_extension)

    def _read_sync(self, user_id: str) -> UserInDB | None:
        path = self._get_file_path(user_id)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return UserInDB.model_validate(data)

    def _read_all_sync(self) -> list[UserInDB]:
        result = []
        for file in sorted(self._root_path.iterdir()):
            if file.is_file() and file.suffix == self._file_extension:
                with file.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                result.append(UserInDB.model_validate(data))
        return result

    def _write_sync(self, user: UserInDB) -> None:
        path = self._get_file_path(user.id)
        with path.open("w", encoding="utf-8") as f:
            yaml.dump(user.model_dump(mode="json"), f)

    def _delete_sync(self, user_id: str) -> None:
        path = self._get_file_path(user_id)
        if path.exists():
            path.unlink()

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        return await asyncio.to_thread(self._read_sync, user_id)

    async def get_by_username(self, username: str) -> UserInDB | None:
        users = await asyncio.to_thread(self._read_all_sync)
        for user in users:
            if user.username == username:
                return user
        return None

    async def list_all(self) -> list[UserInDB]:
        return await asyncio.to_thread(self._read_all_sync)

    async def save(self, user: UserInDB) -> None:
        await asyncio.to_thread(self._write_sync, user)

    async def delete(self, user_id: str) -> None:
        await asyncio.to_thread(self._delete_sync, user_id)
