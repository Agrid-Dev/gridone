from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, Mock

import pytest
import pytest_asyncio

from models.protections import PointDefinition, ProtectionDefinition
from models.types import DataType
from protections.service import ProtectionsService
from protections.storage.protocol import ProtectionsStorage


@pytest.fixture
def definition() -> ProtectionDefinition:
    return ProtectionDefinition.model_validate(
        {
            "name": "Pump A interlock",
            "explanation": "Only one pump may run",
            "target": {"device_id": "a", "attribute": "command", "value": True},
            "condition": {
                "op": "eq",
                "left": {"device_id": "b", "attribute": "running"},
                "right": False,
            },
        }
    )


@pytest.fixture
def inspector() -> Mock:
    return Mock(
        return_value=PointDefinition(
            data_type=DataType.BOOL, writable=True, max_age_seconds=30
        )
    )


@pytest.fixture
def storage() -> AsyncMock:
    result = AsyncMock(spec=ProtectionsStorage)
    result.list_protections.return_value = []
    result.save.side_effect = lambda rule: rule
    return result


@pytest_asyncio.fixture
async def service(
    inspector: Mock, storage: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[ProtectionsService]:
    monkeypatch.setattr(
        "protections.service.build_storage", AsyncMock(return_value=storage)
    )
    svc = ProtectionsService(None, inspector)
    await svc.start()
    yield svc
    await svc.stop()
