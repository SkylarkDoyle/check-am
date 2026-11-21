from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://checkam:change-me@localhost:5432/checkam"
    test_database_url: str | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    host: str = "127.0.0.1"
    port: int = 8000
    rate_limit_per_minute: int = 60
    environment: str = "development"
    redis_url: str | None = None
    # Pool sizing: keep small on Neon free + FastAPI Cloud Nano (500 MiB).
    db_pool_min: int = 1
    db_pool_max: int = 5

    @property
    def conn_url(self) -> str:
        # Standardize for psycopg AsyncConnectionPool
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")


settings = Settings()
