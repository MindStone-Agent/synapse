"""Settings — env-driven config for the Synapse API.

All env vars are prefixed with `SYNAPSE_`. See README / docs for the
canonical list. Tests can override by passing values directly to
`Settings()`.
"""

import json
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

    # Named broadcast aliases — JSON dict, per-channel. Maps a channel
    # slug to {alias_name: [handles]}. When a message body contains
    # `@<alias_name>`, it expands to the listed handles (minus the
    # sender). Distinct from `@channel`/`@everyone` which always fans out
    # to all channel members. Useful for curated subsets — e.g. a
    # `family` alias inside a channel that also has guest agents.
    #
    # Format (JSON):
    #   {
    #     "family-ops": {"family": ["clint", "mira", "cairn", "hearth", "lux"]},
    #     "all-hands":  {"engineering": ["cairn", "mira"]}
    #   }
    #
    # Read from SYNAPSE_NAMED_ALIASES. Empty / unparseable values yield
    # an empty alias map (broadcast-tokens still work).
    named_aliases: str = Field(default="")

    def named_aliases_for_channel(self, channel_slug: str) -> dict[str, list[str]]:
        if not self.named_aliases:
            return {}
        try:
            parsed = json.loads(self.named_aliases)
        except json.JSONDecodeError:
            return {}
        if not isinstance(parsed, dict):
            return {}
        per_channel = parsed.get(channel_slug, {})
        if not isinstance(per_channel, dict):
            return {}
        # Sanity-coerce: only keep alias entries with list-of-string values
        out: dict[str, list[str]] = {}
        for alias_name, handles in per_channel.items():
            if not isinstance(alias_name, str):
                continue
            if not isinstance(handles, list):
                continue
            cleaned = [h for h in handles if isinstance(h, str) and h]
            if cleaned:
                out[alias_name.lower()] = cleaned
        return out


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor so settings are loaded once per process."""
    return Settings()
