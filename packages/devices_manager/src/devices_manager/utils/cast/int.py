import contextlib


def cast_as_int(v) -> int:  # noqa: ANN001
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    if isinstance(v, float):
        return round(v)
    if isinstance(v, str):
        with contextlib.suppress(ValueError):
            return round(float(v))

    msg = f"Cannot cast {v} (type {type(v)} as int"
    raise TypeError(msg)
