from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://checkam:change-me@localhost:5432/checkam"
    test_database_url: str | None = None
    # Direct (non-pooled) Neon URL; used only when the ETL runs with --target neon.
    neon_direct_url: str | None = None
    etl_contact_email: str = "dev@checkam.ng"
    etl_user_agent: str = "CheckAmETL/0.1 (+mailto:dev@checkam.ng)"
    etl_min_delay_seconds: float = 2.0
    etl_raw_cache_dir: str = "./raw_cache"
    etl_cache_ttl_hours: float = 24.0
    image_provider: str = "ddgs"
    image_enrich_min_delay_seconds: float = 0.7  # gap between search starts, all workers
    image_enrich_workers: int = 6
    greenbook_endpoint: str = ""
    alert_webhook_url: str | None = None


settings = Settings()
