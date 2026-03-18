import uuid
from datetime import UTC, datetime

import yaml
from models.errors import InvalidError, NotFoundError
from users import User, UsersManager
from users.models import UserType
from users.password import hash_password

from apps.models import (
    SERVICE_ACCOUNT_REQUIRED_FIELDS,
    RegistrationRequest,
    RegistrationRequestCreate,
    RegistrationRequestStatus,
    RegistrationRequestType,
)
from apps.storage.storage_backend import RegistrationRequestStorageBackend


class AppsManager:
    def __init__(self, storage: RegistrationRequestStorageBackend) -> None:
        self._storage = storage

    async def close(self) -> None:
        await self._storage.close()

    @classmethod
    async def from_storage(cls, storage_url: str) -> "AppsManager":
        from apps.storage import build_registration_request_storage  # noqa: PLC0415

        storage = await build_registration_request_storage(storage_url)
        return cls(storage)

    @staticmethod
    def _validate_config(config: str, req_type: RegistrationRequestType) -> None:
        """Validate the YAML config string.

        For service_account requests, the config must be well-formed YAML
        containing at least the required manifest fields.
        """
        if req_type != RegistrationRequestType.SERVICE_ACCOUNT:
            return
        if not config:
            msg = "config is required for service_account registrations"
            raise InvalidError(msg)
        try:
            parsed = yaml.safe_load(config)
        except yaml.YAMLError as e:
            msg = f"config is not valid YAML: {e}"
            raise InvalidError(msg) from e
        if not isinstance(parsed, dict):
            msg = "config must be a YAML mapping"
            raise InvalidError(msg)
        missing = SERVICE_ACCOUNT_REQUIRED_FIELDS - parsed.keys()
        if missing:
            msg = f"config is missing required fields: {', '.join(sorted(missing))}"
            raise InvalidError(msg)

    async def create_registration_request(
        self, create_data: RegistrationRequestCreate
    ) -> RegistrationRequest:
        self._validate_config(create_data.config, create_data.type)
        request = RegistrationRequest(
            id=str(uuid.uuid4()),
            username=create_data.username,
            hashed_password=hash_password(create_data.password),
            type=create_data.type,
            status=RegistrationRequestStatus.PENDING,
            created_at=datetime.now(UTC),
            config=create_data.config,
        )
        await self._storage.save(request)
        return request

    async def list_registration_requests(self) -> list[RegistrationRequest]:
        return await self._storage.list_all()

    async def get_registration_request(self, request_id: str) -> RegistrationRequest:
        request = await self._storage.get_by_id(request_id)
        if request is None:
            msg = f"Registration request '{request_id}' not found"
            raise NotFoundError(msg)
        return request

    async def accept_registration_request(
        self, request_id: str, users_manager: UsersManager
    ) -> tuple[RegistrationRequest, User]:
        request = await self.get_registration_request(request_id)
        if request.status != RegistrationRequestStatus.PENDING:
            msg = (
                f"Registration request '{request_id}' "
                f"is not pending (status: {request.status})"
            )
            raise InvalidError(msg)

        user_type = (
            UserType.SERVICE_ACCOUNT
            if request.type == RegistrationRequestType.SERVICE_ACCOUNT
            else UserType.USER
        )
        user = await users_manager.create_user_prehashed(
            username=request.username,
            hashed_password=request.hashed_password,
            user_type=user_type,
        )

        accepted = request.model_copy(
            update={"status": RegistrationRequestStatus.ACCEPTED}
        )
        await self._storage.save(accepted)
        return accepted, user

    async def discard_registration_request(
        self, request_id: str
    ) -> RegistrationRequest:
        request = await self.get_registration_request(request_id)
        if request.status != RegistrationRequestStatus.PENDING:
            msg = (
                f"Registration request '{request_id}' "
                f"is not pending (status: {request.status})"
            )
            raise InvalidError(msg)
        discarded = request.model_copy(
            update={"status": RegistrationRequestStatus.DISCARDED}
        )
        await self._storage.save(discarded)
        return discarded


__all__ = ["AppsManager"]
