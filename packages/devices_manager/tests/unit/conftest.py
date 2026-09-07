from collections.abc import Iterator
from dataclasses import dataclass, field

import pytest

from devices_manager.core.device import device as device_module
from devices_manager.core.transports import io_timing

Attributes = dict[str, object]


@dataclass
class RecordingInstrument:
    """Stand-in for an OpenTelemetry Counter/Histogram.

    Keeps every measurement the code under test emits, so tests assert on the
    domain's metric calls without an OpenTelemetry SDK pipeline behind them.
    """

    measurements: list[tuple[float, Attributes]] = field(default_factory=list)

    def add(self, amount: float, attributes: Attributes | None = None) -> None:
        self.measurements.append((amount, dict(attributes or {})))

    def record(self, amount: float, attributes: Attributes | None = None) -> None:
        self.measurements.append((amount, dict(attributes or {})))

    def total(self, **attributes: object) -> float:
        """Sum of the matching amounts — what a Counter would report."""
        return sum(amount for amount, _ in self._matching(attributes))

    def count(self, **attributes: object) -> int:
        """Number of matching measurements — a Histogram's ``_count``."""
        return sum(1 for _ in self._matching(attributes))

    def _matching(self, attributes: Attributes) -> Iterator[tuple[float, Attributes]]:
        return (
            measurement
            for measurement in self.measurements
            if all(measurement[1].get(k) == v for k, v in attributes.items())
        )


@dataclass
class RecordedMetrics:
    read_duration: RecordingInstrument
    read_addresses: RecordingInstrument
    attribute_read: RecordingInstrument


@pytest.fixture
def metrics(monkeypatch: pytest.MonkeyPatch) -> RecordedMetrics:
    """Swap the process-global instruments ``io_timing``/``device`` record onto
    for per-test recording fakes."""
    recorded = RecordedMetrics(
        read_duration=RecordingInstrument(),
        read_addresses=RecordingInstrument(),
        attribute_read=RecordingInstrument(),
    )
    monkeypatch.setattr(io_timing, "read_duration", recorded.read_duration)
    monkeypatch.setattr(io_timing, "read_addresses", recorded.read_addresses)
    monkeypatch.setattr(device_module, "attribute_read", recorded.attribute_read)
    return recorded
