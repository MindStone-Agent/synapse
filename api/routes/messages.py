"""Messages routes — Phase 1.

GET  /v1/messages?channel=&since=&mentions_me=&limit=  agent polling
POST /v1/messages                                       send a message

Reactions, edit, delete, and search land in phase 2.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from api.auth.channel_access import assert_can_post_to_channel, assert_can_read_channel
from api.auth.dependency import AuthContext, get_current_auth
from api.config import get_settings
from api.cursors import decode_cursor, encode_cursor
from api.db import get_session
from api.mentions import expand_mentions, resolve_handles
from api.models import Account, ChannelMembership, Mention, Message
from api.push import push_worker
from api.realtime import hub


router = APIRouter(prefix="/v1/messages", tags=["messages"])


# --- Schemas -----------------------------------------------------------


class MessageOut(BaseModel):
    id: str
    channel: str  # slug
    thread_id: str | None
    reply_to: str | None
    sender_handle: str
    sender_kind: str  # 'human' | 'agent'
    body: str
    body_format: str
    created_at: datetime
    edited_at: datetime | None
    mentioned_handles: list[str]


class MessagesPage(BaseModel):
    messages: list[MessageOut]
    next_cursor: str | None  # forward-pagination cursor; semantics depend on `order`
    head_cursor: str | None  # cursor of the newest message in the result; pass as `since` to poll forward


class PostMessageBody(BaseModel):
    channel: str = Field(..., description="Channel slug")
    body: str = Field(..., min_length=1, max_length=16_000)
    body_format: str = Field(default="markdown")
    thread_id: str | None = Field(default=None)
    reply_to: str | None = Field(default=None)


# --- Routes ------------------------------------------------------------


@router.get("", response_model=MessagesPage)
def list_messages(
    channel: str = Query(..., description="Channel slug"),
    since: str | None = Query(default=None, description="Opaque cursor from a previous response"),
    mentions_me: bool = Query(default=False, description="Filter to messages mentioning me"),
    limit: int = Query(default=50, ge=1, le=200),
    order: str = Query(
        default="asc",
        pattern="^(asc|desc)$",
        description="asc for cursor polling (oldest first); desc for chat-style 'latest N' initial loads",
    ),
    ctx: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_session),
) -> MessagesPage:
    chan, _ = assert_can_read_channel(ctx, channel, db)

    stmt = select(Message).where(
        Message.channel_id == chan.id,
        Message.deleted_at.is_(None),
    )

    if since:
        try:
            ts, mid = decode_cursor(since)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid `since` cursor",
            )
        # Strict order: (created_at > ts) OR (created_at == ts AND id > mid).
        stmt = stmt.where(
            or_(
                Message.created_at > ts,
                and_(Message.created_at == ts, Message.id > mid),
            )
        )

    if mentions_me:
        stmt = stmt.join(Mention, Mention.message_id == Message.id).where(
            Mention.account_id == ctx.account.id
        )

    if order == "desc":
        # "Latest N first" — for chat initial loads. Reverse client-side
        # if you want to render oldest-at-top.
        stmt = stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1)
    else:
        stmt = stmt.order_by(Message.created_at, Message.id).limit(limit + 1)

    rows = db.execute(stmt).scalars().all()
    has_more = len(rows) > limit
    page = list(rows[:limit])

    # Bulk-load sender accounts + per-message mention handles.
    sender_ids = {m.sender_id for m in page}
    senders: dict[uuid.UUID, Account] = {
        a.id: a
        for a in db.execute(select(Account).where(Account.id.in_(sender_ids))).scalars().all()
    } if sender_ids else {}

    mention_rows = (
        db.execute(
            select(Mention.message_id, Account.handle)
            .join(Account, Account.id == Mention.account_id)
            .where(Mention.message_id.in_([m.id for m in page]))
        ).all()
        if page
        else []
    )
    mentions_by_msg: dict[uuid.UUID, list[str]] = {}
    for mid, handle in mention_rows:
        mentions_by_msg.setdefault(mid, []).append(handle)

    out = []
    for m in page:
        sender = senders.get(m.sender_id)
        out.append(
            MessageOut(
                id=str(m.id),
                channel=chan.slug,
                thread_id=str(m.thread_id) if m.thread_id else None,
                reply_to=str(m.reply_to) if m.reply_to else None,
                sender_handle=sender.handle if sender else "unknown",
                sender_kind=sender.kind if sender else "agent",
                body=m.body,
                body_format=m.body_format,
                created_at=m.created_at,
                edited_at=m.edited_at,
                mentioned_handles=mentions_by_msg.get(m.id, []),
            )
        )

    next_cursor: str | None = None
    if has_more and page:
        last = page[-1]
        next_cursor = encode_cursor(last.created_at, last.id)

    # head_cursor = cursor of the newest message returned (regardless of order),
    # so a client can pass it as `since` to fetch what's been written since.
    head_cursor: str | None = None
    if page:
        newest = max(page, key=lambda m: (m.created_at, m.id))
        head_cursor = encode_cursor(newest.created_at, newest.id)

    return MessagesPage(messages=out, next_cursor=next_cursor, head_cursor=head_cursor)


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def post_message(
    body: PostMessageBody,
    ctx: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_session),
) -> MessageOut:
    if body.body_format not in ("markdown", "plaintext"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="body_format must be 'markdown' or 'plaintext'",
        )

    chan, _ = assert_can_post_to_channel(ctx, body.channel, db)

    thread_uuid: uuid.UUID | None = None
    if body.thread_id:
        try:
            thread_uuid = uuid.UUID(body.thread_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid thread_id"
            )

    reply_to_uuid: uuid.UUID | None = None
    if body.reply_to:
        try:
            reply_to_uuid = uuid.UUID(body.reply_to)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reply_to"
            )

    msg = Message(
        channel_id=chan.id,
        thread_id=thread_uuid,
        reply_to=reply_to_uuid,
        sender_id=ctx.account.id,
        body=body.body,
        body_format=body.body_format,
    )
    db.add(msg)
    db.flush()  # need msg.id for mentions

    # Synapse#1: expand `@channel` / `@everyone` to all channel members and
    # any configured named aliases (e.g. `@family`) to their curated lists.
    # Sender is excluded from broadcast expansion (Slack-style).
    member_handles = list(
        db.execute(
            select(Account.handle)
            .join(ChannelMembership, ChannelMembership.account_id == Account.id)
            .where(ChannelMembership.channel_id == chan.id)
        ).scalars()
    )
    settings = get_settings()
    expanded = expand_mentions(
        body.body,
        channel_member_handles=member_handles,
        named_aliases=settings.named_aliases_for_channel(chan.slug),
        sender_handle=ctx.account.handle,
    )
    resolved = resolve_handles(db, expanded) if expanded else {}
    for handle, account_id in resolved.items():
        db.add(Mention(message_id=msg.id, account_id=account_id))

    db.commit()
    db.refresh(msg)

    out = MessageOut(
        id=str(msg.id),
        channel=chan.slug,
        thread_id=str(msg.thread_id) if msg.thread_id else None,
        reply_to=str(msg.reply_to) if msg.reply_to else None,
        sender_handle=ctx.account.handle,
        sender_kind=ctx.account.kind,
        body=msg.body,
        body_format=msg.body_format,
        created_at=msg.created_at,
        edited_at=msg.edited_at,
        mentioned_handles=list(resolved.keys()),
    )

    envelope = {
        "type": "message.created",
        "channel": chan.slug,
        "message": out.model_dump(mode="json"),
    }

    # Fan out to any WebSocket subscribers on this channel. Threadsafe;
    # never raises into the request path.
    hub.publish(chan.id, envelope)

    # Opt-in @-mention push: for each mentioned account that has
    # push_enabled AND a webhook configured (agents only), fire an
    # HMAC-signed POST to their webhook. Pull-not-push remains the
    # default; this is a delivery hint on top of the pull architecture.
    if resolved:
        push_recipients = []
        accounts_by_id = {
            a.id: a
            for a in db.execute(
                select(Account).where(Account.id.in_(resolved.values()))
            ).scalars().all()
        }
        for account_id in resolved.values():
            recipient = accounts_by_id.get(account_id)
            if (
                recipient is None
                or not recipient.push_enabled
                or recipient.kind != "agent"
                or not recipient.push_webhook_url
                or not recipient.push_webhook_secret
            ):
                continue
            push_recipients.append(
                {
                    "account_id": recipient.id,
                    "handle": recipient.handle,
                    "webhook_url": recipient.push_webhook_url,
                    "secret": recipient.push_webhook_secret,
                }
            )
        if push_recipients:
            push_worker.publish(push_recipients, envelope)

    return out
