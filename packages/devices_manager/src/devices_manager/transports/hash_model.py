import hashlib

from pydantic import BaseModel


def hash_model(model: BaseModel, max_chars: int = 16) -> str:
    """Generate a unique hash for any Pydantic model."""
    canonical_json = model.model_dump_json(by_alias=True, exclude_none=True)
    hash_object = hashlib.sha256(canonical_json.encode("utf-8"))
    return hash_object.hexdigest()[:max_chars]
