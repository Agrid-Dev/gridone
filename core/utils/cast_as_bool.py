def cast_as_bool(b) -> bool:  # noqa: ANN001
    if isinstance(b, bool):
        return b
    if b in [0, 1]:
        return bool(b)
    msg = f"Invalid value to cast as boolean: {b}"
    raise ValueError(msg)
