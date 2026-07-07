from __future__ import annotations

import json
from typing import Any

from devices_manager.core.codecs.fn_codec import FnCodec


def _coerce(value: str) -> int | float | str:
    for cast in (int, float):
        try:
            return cast(value)
        except ValueError:
            pass
    return value


def _key(value: Any) -> str:  # noqa: ANN401
    """Normalize a lookup key so an integral float matches its integer.

    Some transports deliver an integer code as a float — a BACnet AnalogValue
    carries e.g. fault code 0 as ``0.0`` — so ``0.0`` must resolve to the same
    key as a mapping written with integer keys (``{0: "ok"}``).
    """
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _build(raw_mapping: dict[str, Any]) -> FnCodec[Any, Any]:
    forward: dict[str, Any] = {_key(k): v for k, v in raw_mapping.items()}

    reverse: dict[str, str] = {}
    for k, v in forward.items():
        str_v = str(v)
        if str_v in reverse:
            msg = f"Mapping is not bijective: value {v!r} maps to multiple keys"
            raise ValueError(msg)
        reverse[str_v] = k

    def decode(value: Any) -> Any:  # noqa: ANN401
        try:
            return forward[_key(value)]
        except KeyError:
            msg = f"No mapping found for device value: {value!r}"
            raise ValueError(msg) from None

    def encode(value: Any) -> Any:  # noqa: ANN401
        try:
            return _coerce(reverse[str(value)])
        except KeyError:
            msg = f"No reverse mapping found for internal value: {value!r}"
            raise ValueError(msg) from None

    return FnCodec(decoder=decode, encoder=encode, value_options=list(forward.values()))


def mapping_codec(raw: str | dict[Any, Any]) -> FnCodec[Any, Any]:
    if isinstance(raw, dict):
        return _build(raw)

    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError as e:
        msg = f"Invalid mapping argument (expected JSON object): {e}"
        raise ValueError(msg) from e

    if not isinstance(data, dict):
        msg = "Mapping argument must be a JSON object"
        raise TypeError(msg)

    return _build(data)
