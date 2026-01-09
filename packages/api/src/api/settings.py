from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_PATH: str

    model_config = {"env_file": ".env"}


def load_settings() -> Settings:
    return Settings()  # ty: ignore[missing-argument]
