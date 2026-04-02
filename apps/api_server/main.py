import os

from fastapi.middleware.cors import CORSMiddleware
from logging_config import DEV_LOGGING_CONFIG, PROD_LOGGING_CONFIG

from api import create_app

_env = os.environ.get("GRIDONE_ENV", "development")
_logging_config = PROD_LOGGING_CONFIG if _env == "production" else DEV_LOGGING_CONFIG

app = create_app(logging_dict_config=_logging_config)

# Configure CORS
app.add_middleware(
    CORSMiddleware,  # ty: ignore[invalid-argument-type]
    allow_origins=[
        "http://localhost:5173",  # Vite dev server (default port)
        "http://localhost:5174",  # Vite dev server (alternative port)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
