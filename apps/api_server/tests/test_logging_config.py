import json
import logging
import logging.config
import sys

from logging_config import DEV_LOGGING_CONFIG, PROD_LOGGING_CONFIG, JsonFormatter


def _record(
    *,
    msg: str = "hello %s",
    args: tuple[object, ...] = ("world",),
    exc_info: object = None,
) -> logging.LogRecord:
    return logging.LogRecord(
        name="gridone.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=args,
        exc_info=exc_info,  # ty: ignore[invalid-argument-type]
    )


def test_emits_single_line_json_with_core_fields():
    line = JsonFormatter().format(_record())

    assert "\n" not in line
    payload = json.loads(line)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "gridone.test"
    assert payload["message"] == "hello world"
    assert "timestamp" in payload


def test_omits_trace_fields_without_active_span():
    payload = json.loads(JsonFormatter().format(_record()))

    assert "trace_id" not in payload
    assert "span_id" not in payload


def test_includes_trace_fields_when_present():
    record = _record()
    record.otelTraceID = "abc123"
    record.otelSpanID = "def456"

    payload = json.loads(JsonFormatter().format(record))

    assert payload["trace_id"] == "abc123"
    assert payload["span_id"] == "def456"


def test_serializes_exception():
    try:
        int("not-a-number")
    except ValueError:
        record = _record(exc_info=sys.exc_info())

    payload = json.loads(JsonFormatter().format(record))

    assert "ValueError" in payload["exception"]


def test_forwards_extra_fields_into_payload():
    record = _record()
    record.event = "read"
    record.status = "ok"
    record.duration_ms = 12.5

    payload = json.loads(JsonFormatter().format(record))

    assert payload["event"] == "read"
    assert payload["status"] == "ok"
    assert payload["duration_ms"] == 12.5


def test_extra_fields_do_not_override_reserved_keys():
    record = _record()

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "hello world"
    assert payload["logger"] == "gridone.test"
    assert set(payload.keys()) == {"timestamp", "level", "logger", "message"}


def test_prod_config_is_valid_and_uses_json_formatter():
    # dictConfig resolves the "()" factory path, proving it is importable.
    logging.config.dictConfig(PROD_LOGGING_CONFIG)

    assert PROD_LOGGING_CONFIG["handlers"]["console"]["formatter"] == "json"


def test_dev_config_keeps_observability_logs_off_the_console():
    loggers = DEV_LOGGING_CONFIG["loggers"]
    observability_logger = loggers["devices_manager.observability"]

    assert "console" not in observability_logger["handlers"]
    assert observability_logger["propagate"] is False
