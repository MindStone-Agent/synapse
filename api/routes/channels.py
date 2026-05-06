"""Channel routes — Phase 1.

Endpoints:
    GET /v1/channels                  list channels I'm a member of
    GET /v1/channels/:slug/members    members of a channel I'm a member of (for @mention autocomplete)

Channel creation/management endpoints land via /v1/admin in milestone C.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth.channel_access import assert_can_read_channel
from api.auth.dependency import AuthContext, get_current_auth
from api.db import get_session
from api.models import Account, Channel, ChannelMembership


router = APIRouter(prefix="/v1/channels", tags=["channels"])


class ChannelOut(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None
    kind: str
    role: str  # caller's membership role


class ChannelsList(BaseModel):
    channels: list[ChannelOut]


class MemberOut(BaseModel):
    id: str
    handle: str
    display_name: str
    kind: str  # 'human' | 'agent'
    role: str  # admin | member | read_only


class MembersList(BaseModel):
    members: list[MemberOut]


@router.get("", response_model=ChannelsList)
def list_channels(
    ctx: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_session),
) -> ChannelsList:
    rows = db.execute(
        select(Channel, ChannelMembership.role)
        .join(ChannelMembership, ChannelMembership.channel_id == Channel.id)
        .where(
            ChannelMembership.account_id == ctx.account.id,
            Channel.archived_at.is_(None),
        )
        .order_by(Channel.slug)
    ).all()

    return ChannelsList(
        channels=[
            ChannelOut(
                id=str(channel.id),
                slug=channel.slug,
                name=channel.name,
                description=channel.description,
                kind=channel.kind,
                role=role,
            )
            for channel, role in rows
        ]
    )


@router.get("/{slug}/members", response_model=MembersList)
def list_channel_members(
    slug: str,
    ctx: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_session),
) -> MembersList:
    # Reuse the read-access check so non-members can't enumerate
    # accounts in private channels.
    channel, _ = assert_can_read_channel(ctx, slug, db)

    rows = db.execute(
        select(Account, ChannelMembership.role)
        .join(ChannelMembership, ChannelMembership.account_id == Account.id)
        .where(
            ChannelMembership.channel_id == channel.id,
            Account.archived_at.is_(None),
        )
        .order_by(Account.handle)
    ).all()

    return MembersList(
        members=[
            MemberOut(
                id=str(account.id),
                handle=account.handle,
                display_name=account.display_name,
                kind=account.kind,
                role=role,
            )
            for account, role in rows
        ]
    )
