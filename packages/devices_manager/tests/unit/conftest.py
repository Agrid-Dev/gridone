import pytest
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

from devices_manager.core.device import device as device_module
from devices_manager.core.transports import io_timing
from devices_manager.observability.metrics import build_instruments


@pytest.fixture
def metric_reader(monkeypatch: pytest.MonkeyPatch) -> InMemoryMetricReader:
    """Isolated per-test MeterProvider: monkeypatches the instruments
    ``io_timing``/``device`` record onto, instead of the process-global
    registry (see ``build_instruments`` for why)."""
    reader = InMemoryMetricReader()
    meter = MeterProvider(metric_readers=[reader]).get_meter("devices_manager")
    read_duration, read_addresses, attribute_read = build_instruments(meter)

    monkeypatch.setattr(io_timing, "read_duration", read_duration)
    monkeypatch.setattr(io_timing, "read_addresses", read_addresses)
    monkeypatch.setattr(device_module, "attribute_read", attribute_read)

    return reader


def metric_points(reader: InMemoryMetricReader, metric_name: str) -> list:
    """Flatten this reader's current data down to one metric's data points."""
    data = reader.get_metrics_data()
    if data is None:
        return []
    return [
        point
        for resource_metrics in data.resource_metrics
        for scope_metrics in resource_metrics.scope_metrics
        for metric in scope_metrics.metrics
        if metric.name == metric_name
        for point in metric.data.data_points
    ]


def sum_metric(
    reader: InMemoryMetricReader, metric_name: str, **attributes: str
) -> float:
    """Sum a Counter/Sum metric's matching data points' values."""
    return sum(
        point.value
        for point in metric_points(reader, metric_name)
        if all(point.attributes.get(k) == v for k, v in attributes.items())
    )


def histogram_count(
    reader: InMemoryMetricReader, metric_name: str, **attributes: str
) -> int:
    """Sum a Histogram metric's matching data points' counts."""
    return sum(
        point.count
        for point in metric_points(reader, metric_name)
        if all(point.attributes.get(k) == v for k, v in attributes.items())
    )
