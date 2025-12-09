from fastapi.middleware.cors import CORSMiddleware

from api import create_app
from logging_config import LOGGING_CONFIG  # ty: ignore[unresolved-import]

app = create_app(logging_dict_config=LOGGING_CONFIG)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server (default port)
        "http://localhost:5174",  # Vite dev server (alternative port)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
