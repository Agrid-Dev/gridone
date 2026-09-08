"""The contract between a building model and whatever tessellates it.

Deliberately free of any BIM or geometry dependency so the service that owns
the model lifecycle can import it without paying for — or knowing about —
ifcopenshell. The concrete implementation lives in ``assets.conversion.ifc``.
"""

from dataclasses import dataclass
from typing import Protocol

from assets.models import ModelSpace, ModelStorey


class ConversionError(Exception):
    """Raised when an uploaded file cannot be converted to a 3D scene.

    The message is user-facing — keep it readable and free of internals.
    """


@dataclass
class ConversionResult:
    """A converted scene and the metadata extracted alongside it."""

    glb: bytes
    storeys: list[ModelStorey]
    spaces: list[ModelSpace]


class SceneConverter(Protocol):
    """Turns an uploaded building file into a viewer-ready glTF scene.

    ``version`` is the scene contract version: the stored scene is a derived
    artifact of the converter that produced it, so bumping this marks every
    older scene as stale and schedules its rebuild.
    """

    version: int

    def convert(self, data: bytes) -> ConversionResult:
        """Convert *data*, raising :class:`ConversionError` on bad input.

        Runs synchronously and CPU-bound — callers offload it to a thread.
        """
        ...


__all__ = ["ConversionError", "ConversionResult", "SceneConverter"]
