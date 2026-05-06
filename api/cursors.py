"""Opaque cursors for message pagination.

Encoded form: base64url(f"{created_at_iso}|{message_id}").
The two-part shape gives a stable tiebreaker when many messages share
a millisecond, so resumed polls don't double-deliver or skip.

Decoded form: tuple[datetime, UUID].
"""

from __future__ import annotations

import base64
import uuid
from datetime import datetime, timezone


def encode_cursor(created_at: datetime, message_id: uuid.UUID) -> str:
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    raw = f"{created_at.isoformat()}|{message_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    padding = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + padding).decode("utf-8")
        ts_str, id_str = raw.split("|", 1)
        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts, uuid.UUID(id_str)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError(f"Invalid cursor: {cursor!r}") from exc
