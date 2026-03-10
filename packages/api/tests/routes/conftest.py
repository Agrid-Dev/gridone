"""Shared fixtures for all router tests.

Provides a default admin token payload so that permission checks pass
without needing a real AuthService / JWT in unit tests.
"""

from datetime import UTC, datetime, timedelta

import pytest
from users.auth import TokenPayload

_ADMIN_PAYLOAD = TokenPayload(
    sub="test-user",
    role="admin",
    exp=datetime.now(UTC) + timedelta(hours=1),
)


@pytest.fixture
def admin_token_payload():
    """A TokenPayload with admin role for use in tests."""
    return _ADMIN_PAYLOAD
