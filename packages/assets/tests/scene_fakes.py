# ruff: noqa: INP001, TC003 — importable helper module next to conftest, not a
# package; threading is a runtime import (the fake instantiates an Event).
"""A scripted :class:`~assets.conversion.SceneConverter` for service tests.

Services own the model lifecycle, not the tessellation: what they need from a
converter is a version, a result, and the ability to fail or to take its time.
Substituting one here keeps those tests off ifcopenshell — the real converter
is exercised in ``test_conversion.py``.

The default result mirrors what ``ifc_fixtures.build_ifc()`` produces, so
tests read the same as they did against the real thing.
"""

import threading

from assets.conversion import ConversionResult
from assets.models import ModelSpace, ModelStorey

DEFAULT_STOREYS = [
    ModelStorey(global_id="s0", name="Level 0", elevation=0.0),
    ModelStorey(global_id="s1", name="Level 1", elevation=3.0),
]

DEFAULT_SPACES = [
    ModelSpace(
        global_id="sp0",
        name="Room 001",
        storey_global_id="s0",
        storey_name="Level 0",
    ),
    ModelSpace(
        global_id="sp1",
        name="Room 101",
        storey_global_id="s1",
        storey_name="Level 1",
    ),
]


class FakeSceneConverter:
    """Answers from a script instead of parsing anything.

    Every knob is public and meant to be flipped between calls. ``gate`` holds
    ``convert`` open, which is how a conversion is observed *while* it is in
    flight; ``gate_only`` narrows that hold to one payload, so a second
    conversion can overtake the first. ``results`` gives a payload its own
    scene, which is what makes a clobbered result visible. Always release the
    gate in a ``finally`` — the call runs on a worker thread that outlives
    cancellation.
    """

    def __init__(
        self,
        *,
        version: int = 1,
        storeys: list[ModelStorey] | None = None,
        spaces: list[ModelSpace] | None = None,
        glb: bytes = b"glTF-fake-scene",
        error: Exception | None = None,
    ) -> None:
        self.version = version
        self.calls: list[bytes] = []
        self.gate: threading.Event | None = None
        self.gate_only: bytes | None = None
        self.results: dict[bytes, ConversionResult] = {}
        self._storeys = DEFAULT_STOREYS if storeys is None else storeys
        self._spaces = DEFAULT_SPACES if spaces is None else spaces
        self._glb = glb
        self.error = error

    def convert(self, data: bytes) -> ConversionResult:
        self.calls.append(data)
        if self.gate is not None and self.gate_only in (None, data):
            self.gate.wait(timeout=5)
        if self.error is not None:
            raise self.error
        scripted = self.results.get(data)
        if scripted is not None:
            return scripted
        return ConversionResult(
            glb=self._glb,
            storeys=list(self._storeys),
            spaces=list(self._spaces),
        )
