"""OpenTelemetry tracing setup for the Gridone API.

Opt-in and off by default; see ``README.md`` for configuration.
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
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

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
