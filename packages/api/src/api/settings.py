from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str

    model_config = {"env_file": ".env"}


def load_settings() -> Settings:
    return Settings()  # ty: ignore[missing-argument]
