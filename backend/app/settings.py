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

    # AI lookup (SerpApi Google AI Mode). The key lives only on the server.
    serpapi_api_key: str | None = None
    serpapi_url: str = "https://serpapi.com/search.json"
    ai_lookup_enabled: bool = True
    ai_daily_limit_per_device: int = 5
    ai_daily_limit_per_ip: int = 60  # backstop only: carriers share one IP across many people
    ai_daily_limit_global: int = 100  # protects the SerpApi quota and bill
    ai_cache_ttl_days: int = 30
    ai_none_ttl_days: int = 7
    ai_timeout_seconds: float = 25.0
    ai_poll_seconds: float = 20.0
    # Bump when the prompt changes so old cached answers are not served for the new question.
    ai_prompt_version: int = 2
    ai_ip_salt: str = "checkam"
    # Pool sizing: keep small on Neon free + FastAPI Cloud Nano (500 MiB).
    db_pool_min: int = 1
    db_pool_max: int = 5

    @property
    def ai_enabled(self) -> bool:
        """The feature is on only when switched on AND a key is configured."""
        return self.ai_lookup_enabled and bool(self.serpapi_api_key)

    @property
    def conn_url(self) -> str:
        # Standardize for psycopg AsyncConnectionPool
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")


settings = Settings()
