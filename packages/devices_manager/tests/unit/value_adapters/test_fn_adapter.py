from devices_manager.value_adapters.fn_adapter import FnAdapter

times_two = FnAdapter[float, float](decoder=lambda x: x * 2, encoder=lambda x: x / 2)
square = FnAdapter[float, float](decoder=lambda x: x**2, encoder=lambda x: x**0.5)

plus_one_one_way = FnAdapter[float, float](decoder=lambda x: x + 1)


def test_add_fn_adapter():
    combined = times_two + square
    start = 2
    decoded = combined.decode(start)
    assert decoded == (start * 2) ** 2
    assert combined.encode(decoded) == start


def test_default_encoder_identity():
    combined = times_two + plus_one_one_way
    start = 2
    decoded = combined.decode(start)
    assert decoded == 5  # (2*2)+1
    assert combined.encode(decoded) == 2.5  # (5/2)
