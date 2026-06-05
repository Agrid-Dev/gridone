import json
import logging
from typing import Any

_COMMON_FORMAT = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
_COMMON_DATEFMT = "%Y-%m-%dT%H:%M:%S"


class JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON for structured log ingestion.

    Grafana Alloy / Loki parse these fields directly instead of regex-scraping
    a text line. When OpenTelemetry log instrumentation is active (tracing
    enabled), the active trace/span IDs are attached to each record as
    ``otelTraceID`` / ``otelSpanID`` and surfaced here as ``trace_id`` /
    ``span_id`` so logs can be correlated with traces in Tempo.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # otelTraceID is "0" when no span is active; only emit a real one.
        trace_id = getattr(record, "otelTraceID", "0")
        if trace_id != "0":
            payload["trace_id"] = trace_id
            payload["span_id"] = getattr(record, "otelSpanID", None)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


_THIRD_PARTY_LOGGERS = {
    "httpx": {
        "handlers": ["file"],
        "level": "WARNING",
        "propagate": False,
    },
    "pymodbus": {
        "handlers": ["file"],
        "level": "WARNING",
        "propagate": False,
    },
}

DEV_LOGGING_CONFIG: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": _COMMON_FORMAT,
            "datefmt": _COMMON_DATEFMT,
        },
    },
    "handlers": {
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "default",
            "filename": "gridone_api.log",
            "maxBytes": 20 * 1024 * 1024,  # 20 MB
            "backupCount": 5,
            "encoding": "utf-8",
        },
        "console": {
            "class": "rich.logging.RichHandler",
            "level": "DEBUG",
            "rich_tracebacks": True,
            "markup": True,
        },
    },
    "loggers": {
        "uvicorn": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        **_THIRD_PARTY_LOGGERS,
        # Root logger (fallback)
        "": {
            "handlers": ["file", "console"],
            "level": "INFO",
        },
    },
}

PROD_LOGGING_CONFIG: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "logging_config.JsonFormatter",
            "datefmt": _COMMON_DATEFMT,
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "stream": "ext://sys.stderr",
        },
    },
    "loggers": {
        "uvicorn": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "httpx": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "pymodbus": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        # Root logger (fallback)
        "": {
            "handlers": ["console"],
            "level": "INFO",
        },
    },
}
