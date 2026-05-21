import secrets
from collections.abc import Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, field_validator

from api.env import load_environ


class Settings(BaseModel):
    STORAGE_URL: str | None = None
    DATABASE_URL: str | None = None
    SECRET_KEY: str = secrets.token_hex(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    COOKIE_SECURE: bool = False  # Set True in production (HTTPS)
    GRIDONE_TIMEZONE: str = "UTC"

    model_config = {"extra": "ignore"}

    @field_validator("GRIDONE_TIMEZONE")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except ZoneInfoNotFoundError as e:
            msg = f"Invalid GRIDONE_TIMEZONE '{v}': not a valid IANA timezone name"
            raise ValueError(msg) from e
        return v

    @property
    def storage_url(self) -> str:
        # Fall through to a placeholder so services that require a real
        # backend (e.g. automations, postgres-only) fail fast at start
        # rather than at runtime. Production deployments set STORAGE_URL.
        return self.STORAGE_URL or self.DATABASE_URL or ""

    @property
    def secret_key(self) -> str:
        return self.SECRET_KEY

    @property
    def access_token_expire_minutes(self) -> int:
        return self.ACCESS_TOKEN_EXPIRE_MINUTES

    @property
    def refresh_token_expire_minutes(self) -> int:
        return self.REFRESH_TOKEN_EXPIRE_MINUTES


def load_settings(environ: Mapping[str, str | None] | None = None) -> Settings:
    """Load settings from .env (if present) and os.environ.

    Process env wins on collision. Only keys matching a declared field
    are forwarded to the model; everything else (including
    ``GRIDONE_FEATURE_*`` flags) is dropped here and read separately by
    ``api.features``. Tests can inject a fixed ``environ`` mapping.
    """
    env = environ if environ is not None else load_environ()
    fields = set(Settings.model_fields.keys())
    kwargs = {
        key: value for key, value in env.items() if key in fields and value is not None
    }
    # pydantic coerces str -> bool / int in lax mode at validation time;
    # ty can't follow the dynamic kwarg expansion, so we silence it here.
    return Settings(**kwargs)  # ty: ignore[invalid-argument-type]
