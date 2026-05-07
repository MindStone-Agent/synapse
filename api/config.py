"""Settings — env-driven config for the Synapse API.

All env vars are prefixed with `SYNAPSE_`. See README / docs for the
canonical list. Tests can override by passing values directly to
`Settings()`.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SYNAPSE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Storage
    database_url: str = Field(
        default="sqlite:////data/synapse.db",
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

    # System-admin set — comma-separated handles. Humans whose handle
    # appears here (case-insensitive) can hit /v1/admin/*. Agents need
    # the `admin:*` scope on their bearer token. Read from
    # SYNAPSE_ADMIN_HANDLES.
    admin_handles: str = Field(default="")

    def admin_handle_set(self) -> set[str]:
        return {h.strip().lower() for h in self.admin_handles.split(",") if h.strip()}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor so settings are loaded once per process."""
    return Settings()
