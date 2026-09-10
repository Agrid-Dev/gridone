import os

from cors import configure_cors
from logging_config import DEV_LOGGING_CONFIG, PROD_LOGGING_CONFIG
from telemetry import setup_optin_telemetry

from api import create_app

_env = os.environ.get("GRIDONE_ENV", "development")
_logging_config = PROD_LOGGING_CONFIG if _env == "production" else DEV_LOGGING_CONFIG

app = create_app(logging_dict_config=_logging_config)
configure_cors(app)
setup_optin_telemetry(app)
