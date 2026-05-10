"""Mention extraction.

Phase 1: simple `@handle` matching with a whitelist character class.
Resolution is one batch lookup against accounts.handle so message
posting stays a single transaction.

Patterns:
  @hearth        → match (explicit handle)
  @mira-2        → match
  email@host     → no match (preceded by non-whitespace)
  `@hearth`      → match (in code spans, intentional — humans expect this)
  @channel       → broadcast to all channel members (Synapse#1)
  @everyone      → alias for @channel
  @family        → named alias (config-driven; expands to a curated subset)

Broadcast tokens (`@channel`, `@everyone`) and named aliases never
include the sender themselves — Slack-style discipline: your own
`@channel` doesn't self-notify.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Account


# Lookbehind: nothing, or a non-word char (so emails don't match).
# Handle: starts with a letter, then letters/digits/underscore/hyphen, 1-64 total.
_MENTION_RE = re.compile(r"(?<![\w])@([a-zA-Z][a-zA-Z0-9_\-]{0,63})")

# Tokens that fan out to all channel members. Reserved — must not collide
# with any real account handle. The schema's character class permits these
# as handles, but admin should refuse to create them.
BROADCAST_TOKENS = frozenset({"channel", "everyone"})


def extract_handles(body: str) -> list[str]:
    """Return ordered de-duplicated handles mentioned in the body (no leading @).

    Includes broadcast tokens and named-alias tokens as-is — caller is
    responsible for expanding them to real handles. This keeps the parse
    step pure and DB-free.
    """
    seen: set[str] = set()
    ordered: list[str] = []
    for m in _MENTION_RE.finditer(body):
        h = m.group(1).lower()
        if h not in seen:
            seen.add(h)
            ordered.append(h)
    return ordered


def expand_mentions(
    body: str,
    *,
    channel_member_handles: list[str],
    named_aliases: dict[str, list[str]] | None = None,
    sender_handle: str | None = None,
) -> list[str]:
    """Return ordered de-duplicated *real* handles after expanding broadcasts.

    - Explicit `@handle` mentions are kept as-is.
    - `@channel` / `@everyone` expand to every entry in
      `channel_member_handles`, MINUS the sender (if provided).
    - Named aliases (e.g. `@family`) — looked up in `named_aliases` dict;
      each maps to a curated list of handles, expanded MINUS the sender.
    - Aliases that don't match a known broadcast token or a configured
      named alias are passed through unchanged (so a stray `@nonexistent`
      just fails resolution at the DB step, same as today).

    Order is preserved: each token's expansion appears at the position the
    token first occurred, with later duplicates dropped.
    """
    aliases = {k.lower(): [h.lower() for h in v] for k, v in (named_aliases or {}).items()}
    members_excluding_sender = [
        h for h in (handle.lower() for handle in channel_member_handles)
        if not sender_handle or h != sender_handle.lower()
    ]

    seen: set[str] = set()
    ordered: list[str] = []

    def add(handle: str) -> None:
        h = handle.lower()
        if h in seen:
            return
        seen.add(h)
        ordered.append(h)

    for token in extract_handles(body):
        if token in BROADCAST_TOKENS:
            for h in members_excluding_sender:
                add(h)
        elif token in aliases:
            for h in aliases[token]:
                if not sender_handle or h != sender_handle.lower():
                    add(h)
        else:
            add(token)

    return ordered


def resolve_handles(db: Session, handles: list[str]) -> dict[str, uuid.UUID]:
    """Return {handle: account_id} for handles that exist. Missing handles are silently dropped.

    Lower-cases for the lookup since handles in the DB are lower-cased by convention.
    """
    if not handles:
        return {}
    rows = db.execute(
        select(Account.id, Account.handle).where(Account.handle.in_(handles))
    ).all()
    return {row.handle.lower(): row.id for row in rows}
