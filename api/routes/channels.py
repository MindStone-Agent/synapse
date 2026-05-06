"""Channel routes — Phase 1.

Currently only /v1/channels (list channels visible to me).
Channel creation/management endpoints land in phase 2.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth.dependency import AuthContext, get_current_auth
from api.db import get_session
from api.models import Channel, ChannelMembership


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
