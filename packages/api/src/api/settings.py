from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    STORAGE_URL: str | None = None
    DATABASE_URL: str | None = None
    DB_PATH: str = ".db"

    model_config = {"env_file": ".env"}

    @property
    def storage_url(self) -> str:
        return self.STORAGE_URL or self.DATABASE_URL or self.DB_PATH


def load_settings() -> Settings:
    return Settings()
