from core.types import AttributeValueType
from core.value_parsers.value_parser import ReversibleValueParser


class ScaleParser(ReversibleValueParser[float]):
    scale: float

    def __init__(self, raw: str) -> None:
        self.scale = float(raw)

    def parse(self, value: float) -> float:
        return value * self.scale

    def revert(self, value: AttributeValueType) -> float:
        try:
            return float(value) / self.scale
        except ValueError as e:
            msg = f"Value {value} is not a valid float"
            raise ValueError(msg) from e
