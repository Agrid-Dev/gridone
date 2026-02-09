from typing import Any


def cast_as_str(v: Any) -> str:  # noqa: ANN401
    try:
        return str(v)
    except Exception as e:
        msg = f"Unable to cast {v} (type ({type(v)}) as a str"
        raise TypeError(msg) from e
