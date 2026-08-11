"""OpenTelemetry tracing setup for the Gridone API.

Opt-in and off by default; see ``README.md`` for configuration.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI
    from opentelemetry.sdk.metrics.export import MetricReader
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SpanExporter
    from opentelemetry.trace import Span

logger = logging.getLogger(__name__)

DEFAULT_SERVICE_NAME = "gridone-api"


def _add_trace_context(span: Span, record: logging.LogRecord) -> None:
    """Copy the active span's IDs onto a log record for log↔trace correlation.

    Used as an OpenTelemetry logging ``log_hook``; the instrumentation only
    invokes it when a valid span is in scope. ``JsonFormatter`` reads these
    ``otel*`` attributes, keeping the logging config decoupled from OTel.
    """
    ctx = span.get_span_context()
    record.otelTraceID = format(ctx.trace_id, "032x")
    record.otelSpanID = format(ctx.span_id, "016x")


def setup_optin_telemetry(
    app: FastAPI,
    *,
    span_exporter: SpanExporter | None = None,
    metric_reader: MetricReader | None = None,
) -> TracerProvider | None:
    """Install OpenTelemetry tracing and metrics when OTLP export is enabled.

    Enabled by ``OTEL_EXPORTER_OTLP_ENDPOINT``; a no-op otherwise. Returns the
    ``TracerProvider`` (``None`` when disabled) rather than the process-global
    one, so callers/tests can flush or inspect it without touching global
    state. ``span_exporter``/``metric_reader`` override the default OTLP
    exporters for tests. The ``MeterProvider`` is registered globally so
    devices_manager's OTel-facade instruments pick it up once installed.
    """
    if (
        span_exporter is None
        and metric_reader is None
        and not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    ):
        return None

    # Imported lazily so the disabled path never loads the OpenTelemetry SDK.
    from opentelemetry import metrics, trace
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
        OTLPMetricExporter,
    )
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.logging import LoggingInstrumentor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
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

    reader = (
        metric_reader
        if metric_reader is not None
        else PeriodicExportingMetricReader(OTLPMetricExporter())
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(meter_provider)

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    HTTPXClientInstrumentor().instrument(tracer_provider=provider)
    # Attach trace/span IDs to log records so structured logs correlate with
    # traces. set_logging_format=False leaves the formatter to the logging
    # config; the log_hook is what actually stamps the IDs onto records.
    LoggingInstrumentor().instrument(
        set_logging_format=False, log_hook=_add_trace_context
    )

    logger.info(
        "OpenTelemetry tracing and metrics enabled (exporting to %s)",
        os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "in-memory exporter"),
    )
    return provider
