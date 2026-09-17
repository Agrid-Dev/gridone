import re
from uuid import uuid4

ID_PATTERN = re.compile(r"^[0-9a-f]{16}$")
"""The shape every :func:`gen_id` identifier has. Matches ``3fa85f6457174562``."""


def gen_id() -> str:
    """Generate a 16-character hex identifier suitable for any domain entity."""
    return uuid4().hex[:16]
