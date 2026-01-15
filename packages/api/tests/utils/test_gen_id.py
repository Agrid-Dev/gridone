from api.routes.utils.gen_id import gen_id


def test_gen_id():
    result = gen_id()
    assert isinstance(result, str)
    assert len(result) >= 4
