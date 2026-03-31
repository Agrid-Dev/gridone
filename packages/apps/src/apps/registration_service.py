import logging
import uuid
from datetime import UTC, datetime

import yaml
from models.errors import InvalidError, NotFoundError
from users.models import UserType
from users.password import hash_password

from apps.models import (
    REQUIRED_CONFIG_FIELDS,
    App,
    AppStatus,
    RegistrationRequest,
    RegistrationRequestCreate,
    RegistrationRequestStatus,
)
from apps.storage.storage_backend import (
    AppStorageBackend,
    RegistrationRequestStorageBackend,
)
from users import User, UserCreate, UsersManagerInterface

logger = logging.getLogger(__name__)


class RegistrationService:
    def __init__(
        self,
        storage: RegistrationRequestStorageBackend,
        app_storage: AppStorageBackend,
        users_manager: UsersManagerInterface,
    ) -> None:
        self._storage = storage
        self._app_storage = app_storage
        self._users_manager = users_manager

    async def close(self) -> None:
        await self._storage.close()

    @staticmethod
    def _validate_config(config: str) -> None:
        """Validate the YAML config string.

        The config must be well-formed YAML containing at least the
        required manifest fields.
        """
        if not config:
            msg = "config is required for registration requests"
            raise InvalidError(msg)
        try:
            parsed = yaml.safe_load(config)
        except yaml.YAMLError as e:
            msg = f"config is not valid YAML: {e}"
            raise InvalidError(msg) from e
        if not isinstance(parsed, dict):
            msg = "config must be a YAML mapping"
            raise InvalidError(msg)
        missing = REQUIRED_CONFIG_FIELDS - parsed.keys()
        if missing:
            msg = f"config is missing required fields: {', '.join(sorted(missing))}"
            raise InvalidError(msg)

    async def create_registration_request(
        self, create_data: RegistrationRequestCreate
    ) -> RegistrationRequest:
        self._validate_config(create_data.config)
        request = RegistrationRequest(
            id=str(uuid.uuid4()),
            username=create_data.username,
            hashed_password=hash_password(create_data.password),
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
        self, request_id: str
    ) -> tuple[RegistrationRequest, User, App]:
        request = await self.get_registration_request(request_id)
        if request.status != RegistrationRequestStatus.PENDING:
            msg = (
                f"Registration request '{request_id}' "
                f"is not pending (status: {request.status})"
            )
            raise InvalidError(msg)

        user = await self._users_manager.create_user(
            UserCreate(
                username=request.username,
                password="unused",  # noqa: S106 — pre_hashed_password takes precedence
                type=UserType.SERVICE_ACCOUNT,
            ),
            pre_hashed_password=request.hashed_password,
        )

        parsed = yaml.safe_load(request.config)
        app = App(
            id=str(uuid.uuid4()),
            user_id=user.id,
            name=parsed["name"],
            description=parsed.get("description", ""),
            api_url=parsed["api_url"],
            icon=parsed.get("icon", ""),
            status=AppStatus.REGISTERED,
            manifest=request.config,
        )
        await self._app_storage.save(app)

        accepted = request.model_copy(
            update={"status": RegistrationRequestStatus.ACCEPTED}
        )
        await self._storage.save(accepted)
        return accepted, user, app

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


__all__ = ["RegistrationService"]
