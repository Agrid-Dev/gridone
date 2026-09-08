import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from logging_config import DEV_LOGGING_CONFIG, PROD_LOGGING_CONFIG
from telemetry import setup_optin_telemetry

from api import create_app

_env = os.environ.get("GRIDONE_ENV", "development")
_logging_config = PROD_LOGGING_CONFIG if _env == "production" else DEV_LOGGING_CONFIG

CORS_ORIGINS = [
    "http://localhost:5173",  # Vite dev server (default port)
    "http://localhost:5174",  # Vite dev server (alternative port)
]
# The SDK reads WWW-Authenticate to tell an expired token apart from a bad
# password; browsers strip response headers cross-origin unless listed here.
CORS_EXPOSE_HEADERS = ["WWW-Authenticate"]


def configure_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,  # ty: ignore[invalid-argument-type]
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=CORS_EXPOSE_HEADERS,
    )


app = create_app(logging_dict_config=_logging_config)
configure_cors(app)
setup_optin_telemetry(app)
