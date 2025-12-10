from typing import Any


def cast_as_float(v: Any) -> float:  # noqa: ANN401
    if isinstance(v, float):
        return v
    if isinstance(v, int) and not isinstance(v, bool):
        return float(v)
    msg = f"Cannot cast {v} (type {type(v)} as float"
    raise TypeError(msg)
