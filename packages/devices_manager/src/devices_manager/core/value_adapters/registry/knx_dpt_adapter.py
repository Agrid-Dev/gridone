"""KNX DPT value adapter — delegates encode/decode to xknx DPT classes.

Wire contract (from ``wire_payload.py``):
  - decode input:  ``bool`` (1-bit DPTs) or ``list[int]`` (multi-byte DPTs)
  - encode output: ``bool`` (1-bit DPTs) or ``list[int]`` (multi-byte DPTs)

Adapter argument: DPT string ID in ``"main.sub"`` notation, e.g. ``"9.001"``.
"""

from __future__ import annotations

import enum
from typing import Any

from xknx.dpt import DPTBase
from xknx.dpt.payload import DPTArray
from xknx.dpt.payload import DPTBinary as DPTBinaryPayload

from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def _build_dpt_lookup() -> dict[str, type[DPTBase]]:
    """Build a DPT class mapping from the full xknx registry.

    Keys use DPT string ID in ``"main.sub"`` notation, e.g. ``"9.001"``, ``"20.102"``.
    """
    lookup: dict[str, type[DPTBase]] = {}
    for cls in DPTBase.dpt_class_tree():
        main = getattr(cls, "dpt_main_number", None)
        sub = getattr(cls, "dpt_sub_number", None)
        if main is not None and sub is not None:
            lookup[f"{main}.{sub:03d}"] = cls
    return lookup


_DPT_LOOKUP: dict[str, type[DPTBase]] = _build_dpt_lookup()


def knx_dpt_adapter(dpt_id: str) -> FnAdapter[bool | list[int], Any]:
    """Encode/decode KNX wire values using xknx DPT classes."""

    cls = _DPT_LOOKUP.get(dpt_id)
    if cls is None:
        msg = f"Unknown KNX DPT: '{dpt_id}'. Use 'main.sub' notation (e.g. '9.001')"
        raise ValueError(msg)

    def decode(value: bool | list[int]) -> Any:  # noqa: ANN401, FBT001
        if isinstance(value, bool):
            payload: DPTBinaryPayload | DPTArray = DPTBinaryPayload(value)
        else:
            payload = DPTArray(tuple(value))
        result = cls.from_knx(payload)
        if isinstance(result, enum.Enum):
            return result.value
        return result

    def encode(value: Any) -> bool | list[int]:  # noqa: ANN401
        payload = cls.to_knx(value)
        if isinstance(payload, DPTBinaryPayload):
            return bool(payload.value)
        return list(payload.value)  # list[int]

    return FnAdapter(decoder=decode, encoder=encode)
