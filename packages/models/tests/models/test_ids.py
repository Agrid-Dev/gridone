import re

from models.ids import gen_id

HEX_16 = re.compile(r"^[0-9a-f]{16}$")


def test_gen_id_returns_16_char_hex() -> None:
    assert HEX_16.match(gen_id())


def test_gen_id_returns_distinct_values() -> None:
    ids = {gen_id() for _ in range(1000)}
    assert len(ids) == 1000
