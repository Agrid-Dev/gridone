from uuid import uuid4


def gen_id() -> str:
    """Generate a 16-character hex identifier suitable for any domain entity."""
    return uuid4().hex[:16]
