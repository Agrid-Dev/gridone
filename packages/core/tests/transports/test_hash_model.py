from core.transports.hash_model import hash_model
from pydantic import BaseModel


class MockModel(BaseModel):
    float_attr: float
    int_attr: int
    bool_attr: bool
    str_attr: str


def test_hash_model() -> None:
    mock_model = MockModel(
        float_attr=3.25,
        int_attr=2,
        bool_attr=True,
        str_attr="hellow",
    )
    all_hashes: set[str] = set()

    for _ in range(1000):
        all_hashes.add(hash_model(mock_model))
    assert len(all_hashes) == 1  # hashing must be deterministic
