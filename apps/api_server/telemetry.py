"""OpenTelemetry tracing setup for the Gridone API.

Tracing is opt-in: nothing is configured unless ``OTEL_EXPORTER_OTLP_ENDPOINT``
is set in the environment. When that variable is absent (the default), this
module imports no OpenTelemetry packages and installs no instrumentation, so a
disabled deployment carries zero runtime cost.

When enabled, request and outbound-HTTP spans are exported over OTLP to a local
collector (Grafana Alloy), which forwards them to Grafana Cloud Tempo. Every
other aspect of the SDK (sampling, headers, resource attributes, ...) is
controlled through the standard ``OTEL_*`` environment variables.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SpanExporter

logger = logging.getLogger(__name__)

DEFAULT_SERVICE_NAME = "gridone-api"


def setup_telemetry(
    app: FastAPI, *, span_exporter: SpanExporter | None = None
) -> TracerProvider | None:
    """Install OpenTelemetry tracing on ``app`` when OTLP export is configured.

    Returns the configured ``TracerProvider`` when tracing is enabled, or
    ``None`` when it is disabled (no ``OTEL_EXPORTER_OTLP_ENDPOINT``). The
    optional ``span_exporter`` overrides the default OTLP exporter and exists
    so tests can capture spans in memory.
    """
    if span_exporter is None and not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return None

    # Imported lazily so the disabled path never loads the OpenTelemetry SDK.
    from opentelemetry import trace  # noqa: PLC0415
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import (  # noqa: PLC0415
        OTLPSpanExporter,
    )
    from opentelemetry.instrumentation.fastapi import (  # noqa: PLC0415
        FastAPIInstrumentor,
    )
    from opentelemetry.instrumentation.httpx import (  # noqa: PLC0415
        HTTPXClientInstrumentor,
    )
    from opentelemetry.sdk.resources import Resource  # noqa: PLC0415
    from opentelemetry.sdk.trace import TracerProvider  # noqa: PLC0415
    from opentelemetry.sdk.trace.export import BatchSpanProcessor  # noqa: PLC0415

    # `Resource.create` reads OTEL_SERVICE_NAME / OTEL_RESOURCE_ATTRIBUTES from
    # the environment; seed a default service name unless the operator set one.
    os.environ.setdefault("OTEL_SERVICE_NAME", DEFAULT_SERVICE_NAME)
    resource = Resource.create(
        {"service.version": os.environ.get("GRIDONE_VERSION", "unknown")}
    )

    provider = TracerProvider(resource=resource)
    exporter = span_exporter if span_exporter is not None else OTLPSpanExporter()
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    HTTPXClientInstrumentor().instrument(tracer_provider=provider)

    logger.info(
        "OpenTelemetry tracing enabled (exporting to %s)",
        os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "in-memory exporter"),
    )
    return provider
