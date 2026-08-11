"""OpenTelemetry metric instruments for device I/O observability.

Uses ``opentelemetry-api`` only — a no-op facade until the app installs a
real ``MeterProvider`` (``apps/api_server/telemetry.py``), same pattern as
this codebase's direct use of stdlib ``logging``.
"""

from typing import TYPE_CHECKING

from opentelemetry import metrics

if TYPE_CHECKING:
    from opentelemetry.metrics import Counter, Histogram, Meter

# Tuned for the 1-100ms band where most reads live — OTEL's default buckets
# are sparse there. A histogram's _count/_sum also give request rate and mean
# for free, so no separate requests counter is needed.
_DURATION_BUCKETS_MS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]


def build_instruments(meter: "Meter") -> tuple["Histogram", "Counter", "Counter"]:
    """Create the (read_duration, read_addresses, attribute_read) triple
    from ``meter``.

    Factored out so tests can rebuild these against a local ``MeterProvider``:
    ``set_meter_provider`` only takes effect once per process, so instruments
    obtained via the global registry can't be isolated per test.
    """
    read_duration = meter.create_histogram(
        "device.io.read.duration",
        unit="ms",
        description="Duration of one transport read transaction",
        explicit_bucket_boundaries_advisory=_DURATION_BUCKETS_MS,
    )
    read_addresses = meter.create_counter(
        "device.io.read.addresses",
        description="Transport addresses served per read transaction",
    )
    attribute_read = meter.create_counter(
        "device.attribute.read",
        description="Attribute reads requested, before dedup/batching",
    )
    return read_duration, read_addresses, attribute_read


read_duration, read_addresses, attribute_read = build_instruments(
    metrics.get_meter("devices_manager")
)
