"""Mention extraction.

Phase 1: simple `@handle` matching with a whitelist character class.
Resolution is one batch lookup against accounts.handle so message
posting stays a single transaction.

Patterns:
  @hearth        → match
  @mira-2        → match
  email@host     → no match (preceded by non-whitespace)
  `@hearth`      → match (in code spans, intentional — humans expect this)
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


def extract_handles(body: str) -> list[str]:
    """Return ordered de-duplicated handles mentioned in the body (no leading @)."""
    seen: set[str] = set()
    ordered: list[str] = []
    for m in _MENTION_RE.finditer(body):
        h = m.group(1).lower()
        if h not in seen:
            seen.add(h)
            ordered.append(h)
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
