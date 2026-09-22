from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, Mock

import pytest
import pytest_asyncio

from models.attribute_observation import AttributeDefinition
from models.operating_rules import OperatingRuleDefinition
from models.types import DataType
from operating_rules.service import OperatingRulesService
from operating_rules.storage.protocol import OperatingRulesStorage


@pytest.fixture
def definition() -> OperatingRuleDefinition:
    return OperatingRuleDefinition.model_validate(
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
        return_value=AttributeDefinition(
            data_type=DataType.BOOL, writable=True, max_age_seconds=30
        )
    )


@pytest.fixture
def storage() -> AsyncMock:
    result = AsyncMock(spec=OperatingRulesStorage)
    result.list_operating_rules.return_value = []
    result.save.side_effect = lambda rule: rule
    return result


@pytest_asyncio.fixture
async def service(
    inspector: Mock, storage: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[OperatingRulesService]:
    monkeypatch.setattr(
        "operating_rules.service.build_storage", AsyncMock(return_value=storage)
    )
    svc = OperatingRulesService(None, inspector)
    await svc.start()
    yield svc
    await svc.stop()
