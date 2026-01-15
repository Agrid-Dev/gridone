import uuid


def gen_id() -> str:
    """Temporary id generator: will be handled by storage"""
    return str(uuid.uuid4())[:8]
