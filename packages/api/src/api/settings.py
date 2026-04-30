import secrets

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    STORAGE_URL: str | None = None
    DATABASE_URL: str | None = None
    SECRET_KEY: str = secrets.token_hex(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    COOKIE_SECURE: bool = False  # Set True in production (HTTPS)

    model_config = {"env_file": ".env"}

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


def load_settings() -> Settings:
    return Settings()
