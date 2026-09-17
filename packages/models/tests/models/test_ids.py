from models.ids import ID_PATTERN, gen_id


def test_gen_id_returns_16_char_hex() -> None:
    assert ID_PATTERN.match(gen_id())


def test_gen_id_returns_distinct_values() -> None:
    ids = {gen_id() for _ in range(1000)}
    assert len(ids) == 1000
