"""Scene conversion contract.

Only the protocol and its data types are re-exported here: importing this
package must stay cheap so a service can depend on the contract without
pulling in numpy or ifcopenshell. Composition roots reach for the concrete
converter explicitly with ``from assets.conversion.ifc import
IfcSceneConverter``.
"""

from assets.conversion.converter import (
    ConversionError,
    ConversionResult,
    SceneConverter,
)

__all__ = ["ConversionError", "ConversionResult", "SceneConverter"]
