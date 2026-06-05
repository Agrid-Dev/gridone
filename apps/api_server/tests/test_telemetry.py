from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from telemetry import DEFAULT_SERVICE_NAME, setup_telemetry


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


@pytest.fixture
def app() -> FastAPI:
    return _make_app()


@pytest.fixture(autouse=True)
def _uninstrument(app: FastAPI) -> Iterator[None]:
    # Instrumentation patches global/app state; undo it after each test so the
    # suite stays isolated.
    yield
    FastAPIInstrumentor.uninstrument_app(app)
    instrumentor = HTTPXClientInstrumentor()
    if instrumentor.is_instrumented_by_opentelemetry:
        instrumentor.uninstrument()


def test_disabled_by_default_is_a_noop(app: FastAPI, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)

    result = setup_telemetry(app)

    assert result is None
    assert getattr(app, "_is_instrumented_by_opentelemetry", False) is False


def test_enabled_records_request_spans(app: FastAPI, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    exporter = InMemorySpanExporter()

    provider = setup_telemetry(app, span_exporter=exporter)
    assert isinstance(provider, TracerProvider)

    with TestClient(app) as client:
        assert client.get("/ping").status_code == 200

    provider.force_flush()
    spans = exporter.get_finished_spans()
    assert any(span.name == "GET /ping" for span in spans)


def test_default_service_name_seeded(app: FastAPI, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)

    provider = setup_telemetry(app, span_exporter=InMemorySpanExporter())
    assert provider is not None

    assert provider.resource.attributes["service.name"] == DEFAULT_SERVICE_NAME


def test_respects_operator_service_name(app: FastAPI, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    monkeypatch.setenv("OTEL_SERVICE_NAME", "custom-name")

    provider = setup_telemetry(app, span_exporter=InMemorySpanExporter())
    assert provider is not None

    assert provider.resource.attributes["service.name"] == "custom-name"
