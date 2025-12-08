from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_PATH: str

    class Config:
        env_file = ".env"


settings = Settings()  # ty: ignore[missing-argument]
