import uuid


def gen_id() -> str:
    """Generate a short random id for a new entity."""
    return str(uuid.uuid4())[:8]
