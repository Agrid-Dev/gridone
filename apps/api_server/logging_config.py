_COMMON_FORMAT = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
_COMMON_DATEFMT = "%Y-%m-%d %H:%M:%S"

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

DEV_LOGGING_CONFIG = {
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

PROD_LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": _COMMON_FORMAT,
            "datefmt": _COMMON_DATEFMT,
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
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
