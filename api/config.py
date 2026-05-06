"""Settings — env-driven config for the Agora API.

All env vars are prefixed with `AGORA_`. See README / docs for the
canonical list. Tests can override by passing values directly to
`Settings()`.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AGORA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Storage
    database_url: str = Field(
        default="sqlite:////data/agora.db",
        description="SQLAlchemy URL. SQLite for v1; Postgres-ready.",
    )

    # Networking
    bind: str = Field(default="0.0.0.0:8000")
    base_url: str | None = Field(
        default=None,
        description="Public origin. Used when sending links (e.g. magic-link emails) in v2.",
    )

    # Logging
    log_level: str = Field(default="info")

    # First-run admin bootstrap
    admin_bootstrap_token: str | None = Field(
        default=None,
        description="One-shot admin token for first-run account creation. Cleared/rotated after use.",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor so settings are loaded once per process."""
    return Settings()
