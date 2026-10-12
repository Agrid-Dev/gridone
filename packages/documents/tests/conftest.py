from datetime import UTC, datetime

import pytest

from documents import Document


@pytest.fixture
def document() -> Document:
    now = datetime.now(UTC)
    return Document(
        id="a" * 16,
        name="Notice chaudière",
        filename="notice.txt",
        media_type="text/plain",
        size=7,
        created_by="admin",
        created_at=now,
        updated_at=now,
        allowed_role_ids=["viewer"],
        asset_ids=["building"],
        device_ids=["boiler"],
    )
