"""Application configuration.

All runtime configuration comes from environment variables (12-factor).
Locally, values are read from `backend/.env`; on Fly.io they come from
`fly secrets` / `[env]` in fly.toml. Nothing secret is ever committed.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- service ------------------------------------------------------------
    app_name: str = "reverse-spec-api"
    environment: str = "development"          # development | production
    log_level: str = "INFO"

    # --- database -----------------------------------------------------------
    database_url: str = (
        "postgresql+psycopg://reversespec:reversespec@localhost:5432/reversespec"
    )

    # --- auth ---------------------------------------------------------------
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 24
    nonce_ttl_seconds: int = 300

    # --- CORS ---------------------------------------------------------------
    # Comma-separated list of allowed origins (the Vercel domain in prod).
    cors_origins: str = "http://localhost:3000"

    # --- GenLayer -----------------------------------------------------------
    # Set after the user deploys the contract to StudioNet.
    genlayer_contract_address: str = ""
    genlayer_network: str = "studionet"       # studionet | localnet
    indexer_interval_seconds: int = 30
    indexer_enabled: bool = True

    # --- rate limiting --------------------------------------------------------
    rate_limit_default: str = "120/minute"
    rate_limit_auth: str = "20/minute"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
