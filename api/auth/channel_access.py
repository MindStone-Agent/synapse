"""Channel-level access checks.

Combines:
  - Channel exists + not archived (else 404)
  - Caller is a member (else 403)
  - For agents: bearer token has the right scope (else 403)
  - For humans posting: membership role isn't read-only (else 403)

Returns the resolved Channel + ChannelMembership for the caller's
convenience so the endpoint doesn't have to look them up again.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth.dependency import AuthContext
from api.models import Channel, ChannelMembership


def _load(db: Session, slug: str, account_id) -> tuple[Channel, ChannelMembership]:
    row = db.execute(
        select(Channel, ChannelMembership)
        .join(
            ChannelMembership,
            (ChannelMembership.channel_id == Channel.id)
            & (ChannelMembership.account_id == account_id),
            isouter=True,
        )
        .where(Channel.slug == slug)
    ).one_or_none()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")

    channel, membership = row
    if channel.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel archived")
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    return channel, membership


def assert_can_read_channel(
    ctx: AuthContext, slug: str, db: Session
) -> tuple[Channel, ChannelMembership]:
    channel, membership = _load(db, slug, ctx.account.id)

    if ctx.account.kind == "agent":
        if not ctx.has_scope(f"channel:{slug}:read"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Token lacks read scope for this channel",
            )

    return channel, membership


def assert_can_post_to_channel(
    ctx: AuthContext, slug: str, db: Session
) -> tuple[Channel, ChannelMembership]:
    channel, membership = _load(db, slug, ctx.account.id)

    if ctx.account.kind == "agent":
        if not ctx.has_scope(f"channel:{slug}:post"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Token lacks post scope for this channel",
            )
    else:
        # Human: read-only role can't post.
        if membership.role == "read_only":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Read-only membership cannot post",
            )

    return channel, membership
