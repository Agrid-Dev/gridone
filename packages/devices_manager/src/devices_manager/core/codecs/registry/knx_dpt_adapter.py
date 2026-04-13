from __future__ import annotations

import enum
from typing import Any

from xknx.dpt import DPTBase
from xknx.dpt.payload import DPTArray
from xknx.dpt.payload import DPTBinary as DPTBinaryPayload

from devices_manager.core.codecs.fn_codec import FnCodec


def knx_dpt_adapter(dpt_id: str) -> FnCodec[bool | list[int], Any]:
    """Decode/encode KNX wire values via xknx DPT classes.

    ``dpt_id``: e.g. ``"9.001"`` or ``"9.1"`` (both forms accepted).
    """
    transcoder = DPTBase.parse_transcoder(dpt_id)
    if transcoder is None:
        msg = f"Unknown KNX DPT: '{dpt_id}'. Use 'main.sub' notation (e.g. '9.001')"
        raise ValueError(msg)

    def decode(value: bool | list[int]) -> Any:  # noqa: ANN401, FBT001
        if isinstance(value, bool):
            payload: DPTBinaryPayload | DPTArray = DPTBinaryPayload(value)
        else:
            payload = DPTArray(tuple(value))
        result = transcoder.from_knx(payload)
        if isinstance(result, enum.Enum):
            return result.value
        return result

    def encode(value: Any) -> bool | list[int]:  # noqa: ANN401
        payload = transcoder.to_knx(value)
        if isinstance(payload, DPTBinaryPayload):
            return bool(payload.value)
        return list(payload.value)  # list[int]

    return FnCodec(decoder=decode, encoder=encode)
