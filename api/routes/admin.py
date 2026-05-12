"""Admin HTTP endpoints — mirror api/admin.py CLI for the web admin UI.

Gated by `require_admin`:
  - Humans whose handle is in SYNAPSE_ADMIN_HANDLES (env)
  - Agents with `admin:*` scope on their bearer token

Surface (v1):
  GET    /v1/admin/accounts                        list all accounts
  POST   /v1/admin/accounts                        create human or agent
  PATCH  /v1/admin/accounts/{id}                   update display_name / password / email
  POST   /v1/admin/accounts/{id}/archive           soft-archive
  POST   /v1/admin/accounts/{id}/unarchive         un-archive

  GET    /v1/admin/channels                        list all channels
  POST   /v1/admin/channels                        create
  POST   /v1/admin/channels/{id}/archive           soft-archive
  POST   /v1/admin/channels/{id}/unarchive

  POST   /v1/admin/memberships                     add member
  DELETE /v1/admin/memberships/{account_id}/{channel_id}   remove

  GET    /v1/admin/tokens?account=<handle>         list tokens for an agent
  POST   /v1/admin/tokens                          issue (raw printed once)
  POST   /v1/admin/tokens/{id}/revoke              revoke
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth.dependency import AuthContext, require_admin
from api.auth.passwords import hash_password
from api.auth.tokens import generate_token, sha256_hash
from api.db import get_session
from api.models import (
    Account,
    AgentToken,
    Channel,
    ChannelMembership,
)


router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# --- Schemas -----------------------------------------------------------


class AccountOut(BaseModel):
    id: str
    handle: str
    kind: str
    display_name: str
    email: str | None
    created_at: datetime
    archived_at: datetime | None


class CreateAccountBody(BaseModel):
    kind: str = Field(..., pattern="^(human|agent)$")
    handle: str
    display_name: str | None = None
    email: str | None = None
    password: str | None = None


class UpdateAccountBody(BaseModel):
    display_name: str | None = None
    email: str | None = None
    password: str | None = None


class ChannelOut(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None
    kind: str
    created_at: datetime
    archived_at: datetime | None


class CreateChannelBody(BaseModel):
    slug: str
    name: str
    description: str | None = None
    kind: str = Field(default="public", pattern="^(public|private|dm)$")


class CreateMembershipBody(BaseModel):
    account_handle: str
    channel_slug: str
    role: str = Field(default="member", pattern="^(admin|member|read_only)$")


class TokenOut(BaseModel):
    id: str
    account_handle: str
    scopes: list[str]
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class IssueTokenBody(BaseModel):
    account_handle: str
    scopes: list[str]


class IssuedTokenOut(TokenOut):
    token: str  # raw value, printed once


class PushConfigOut(BaseModel):
    """Push status for an account. Does NOT include the raw secret."""

    account_handle: str
    enabled: bool
    webhook_url: str | None
    has_secret: bool


class SetPushBody(BaseModel):
    """Configure push for an account.

    For agents:
      - When enabling, webhook_url is required.
      - If secret is omitted, the server generates one and returns it once.
      - If secret is provided, it's used as-is (caller has the responsibility
        to keep it long + random).
    For humans:
      - Only `enabled` is meaningful (drives browser notification on the
        existing WS event). webhook_url and secret are ignored / forced null.
    """

    enabled: bool
    webhook_url: str | None = None
    secret: str | None = None


class IssuedPushConfigOut(PushConfigOut):
    """Returned from PATCH /accounts/{id}/push.

    `secret` is the raw value, printed exactly once on issuance. Subsequent
    GETs return a `PushConfigOut` without it.
    """

    secret: str | None = None


# --- Helpers -----------------------------------------------------------


def _account_or_404(db: Session, account_id: str) -> Account:
    try:
        uid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account id")
    acc = db.get(Account, uid)
    if acc is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


def _channel_or_404(db: Session, channel_id: str) -> Channel:
    try:
        uid = uuid.UUID(channel_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid channel id")
    ch = db.get(Channel, uid)
    if ch is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return ch


def _account_to_out(a: Account) -> AccountOut:
    return AccountOut(
        id=str(a.id),
        handle=a.handle,
        kind=a.kind,
        display_name=a.display_name,
        email=a.email,
        created_at=a.created_at,
        archived_at=a.archived_at,
    )


def _channel_to_out(c: Channel) -> ChannelOut:
    return ChannelOut(
        id=str(c.id),
        slug=c.slug,
        name=c.name,
        description=c.description,
        kind=c.kind,
        created_at=c.created_at,
        archived_at=c.archived_at,
    )


def _token_to_out(t: AgentToken, account_handle: str) -> TokenOut:
    return TokenOut(
        id=str(t.id),
        account_handle=account_handle,
        scopes=list(t.scopes or []),
        created_at=t.created_at,
        last_used_at=t.last_used_at,
        revoked_at=t.revoked_at,
    )


# --- Accounts ----------------------------------------------------------


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_session)) -> list[AccountOut]:
    rows = db.execute(select(Account).order_by(Account.handle)).scalars().all()
    return [_account_to_out(a) for a in rows]


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(
    body: CreateAccountBody,
    db: Session = Depends(get_session),
) -> AccountOut:
    handle = body.handle.lower()
    existing = db.execute(
        select(Account).where(Account.handle == handle)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Handle already exists")

    if body.kind == "human" and not body.password:
        raise HTTPException(status_code=400, detail="Humans require a password")
    if body.kind == "agent" and body.password:
        raise HTTPException(
            status_code=400, detail="Agents authenticate via tokens, not passwords"
        )

    acc = Account(
        kind=body.kind,
        handle=handle,
        display_name=body.display_name or handle,
        email=body.email,
        password_hash=hash_password(body.password) if body.password else None,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _account_to_out(acc)


@router.patch("/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: str,
    body: UpdateAccountBody,
    db: Session = Depends(get_session),
) -> AccountOut:
    acc = _account_or_404(db, account_id)
    if body.display_name is not None:
        acc.display_name = body.display_name
    if body.email is not None:
        acc.email = body.email
    if body.password is not None:
        if acc.kind != "human":
            raise HTTPException(status_code=400, detail="Only humans have passwords")
        acc.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(acc)
    return _account_to_out(acc)


@router.post("/accounts/{account_id}/archive", response_model=AccountOut)
def archive_account(
    account_id: str, db: Session = Depends(get_session)
) -> AccountOut:
    acc = _account_or_404(db, account_id)
    if acc.archived_at is None:
        acc.archived_at = datetime.now(tz=timezone.utc)
        db.commit()
        db.refresh(acc)
    return _account_to_out(acc)


@router.post("/accounts/{account_id}/unarchive", response_model=AccountOut)
def unarchive_account(
    account_id: str, db: Session = Depends(get_session)
) -> AccountOut:
    acc = _account_or_404(db, account_id)
    if acc.archived_at is not None:
        acc.archived_at = None
        db.commit()
        db.refresh(acc)
    return _account_to_out(acc)


@router.get("/accounts/{account_id}/push", response_model=PushConfigOut)
def get_account_push(
    account_id: str, db: Session = Depends(get_session)
) -> PushConfigOut:
    acc = _account_or_404(db, account_id)
    return PushConfigOut(
        account_handle=acc.handle,
        enabled=bool(acc.push_enabled),
        webhook_url=acc.push_webhook_url,
        has_secret=acc.push_webhook_secret is not None,
    )


@router.patch("/accounts/{account_id}/push", response_model=IssuedPushConfigOut)
def set_account_push(
    account_id: str,
    body: SetPushBody,
    db: Session = Depends(get_session),
) -> IssuedPushConfigOut:
    """Configure opt-in @-mention push for an account (Phase 1 #4).

    Pull-not-push remains the default; this is a delivery hint *on top* of
    the pull architecture. Triggers only when (1) the account has explicitly
    opted in via `enabled=true`, AND (2) a message tags them via @handle.
    """
    acc = _account_or_404(db, account_id)
    raw_secret_to_return: str | None = None

    # Disable path: clear webhook + secret hash, flip flag off.
    if body.enabled is False:
        acc.push_enabled = False
        acc.push_webhook_url = None
        acc.push_webhook_secret = None
        db.commit()
        db.refresh(acc)
        return IssuedPushConfigOut(
            account_handle=acc.handle,
            enabled=False,
            webhook_url=None,
            has_secret=False,
            secret=None,
        )

    # Enable path: validate per-kind constraints.
    if acc.kind == "agent":
        if not body.webhook_url:
            raise HTTPException(
                status_code=400,
                detail="Agents enabling push must provide webhook_url",
            )
        # Issue a fresh secret if none provided (most common path).
        if body.secret is None:
            raw_secret_to_return = generate_token()
        else:
            raw_secret_to_return = body.secret
        # v1: store plaintext (HMAC signing requires the raw value).
        # v2: encrypt at rest with a server-side key.
        acc.push_webhook_secret = raw_secret_to_return
        acc.push_webhook_url = body.webhook_url
    else:
        # Human: webhook_url + secret don't apply; force null.
        acc.push_webhook_url = None
        acc.push_webhook_secret = None

    acc.push_enabled = True
    db.commit()
    db.refresh(acc)

    return IssuedPushConfigOut(
        account_handle=acc.handle,
        enabled=True,
        webhook_url=acc.push_webhook_url,
        has_secret=acc.push_webhook_secret is not None,
        secret=raw_secret_to_return,
    )


# --- Channels ----------------------------------------------------------


@router.get("/channels", response_model=list[ChannelOut])
def list_all_channels(db: Session = Depends(get_session)) -> list[ChannelOut]:
    rows = db.execute(select(Channel).order_by(Channel.slug)).scalars().all()
    return [_channel_to_out(c) for c in rows]


@router.post("/channels", response_model=ChannelOut, status_code=201)
def create_channel(
    body: CreateChannelBody,
    db: Session = Depends(get_session),
    ctx: AuthContext = Depends(require_admin),
) -> ChannelOut:
    slug = body.slug.lower()
    existing = db.execute(
        select(Channel).where(Channel.slug == slug)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Slug already exists")
    ch = Channel(slug=slug, name=body.name, description=body.description, kind=body.kind)
    db.add(ch)
    db.flush()  # Get ch.id without ending the transaction.

    # Auto-add the creator as a member (admin role) so they can navigate to
    # the channel they just created without a separate membership call.
    # Other members are added explicitly via POST /v1/admin/memberships.
    db.add(ChannelMembership(account_id=ctx.account.id, channel_id=ch.id, role="admin"))

    db.commit()
    db.refresh(ch)
    return _channel_to_out(ch)


@router.post("/channels/{channel_id}/archive", response_model=ChannelOut)
def archive_channel(
    channel_id: str, db: Session = Depends(get_session)
) -> ChannelOut:
    ch = _channel_or_404(db, channel_id)
    if ch.archived_at is None:
        ch.archived_at = datetime.now(tz=timezone.utc)
        db.commit()
        db.refresh(ch)
    return _channel_to_out(ch)


@router.post("/channels/{channel_id}/unarchive", response_model=ChannelOut)
def unarchive_channel(
    channel_id: str, db: Session = Depends(get_session)
) -> ChannelOut:
    ch = _channel_or_404(db, channel_id)
    if ch.archived_at is not None:
        ch.archived_at = None
        db.commit()
        db.refresh(ch)
    return _channel_to_out(ch)


# --- Memberships -------------------------------------------------------


class MembershipOut(BaseModel):
    account_handle: str
    channel_slug: str
    role: str
    joined_at: datetime


@router.post("/memberships", response_model=MembershipOut, status_code=201)
def add_membership(
    body: CreateMembershipBody,
    db: Session = Depends(get_session),
) -> MembershipOut:
    acc = db.execute(
        select(Account).where(Account.handle == body.account_handle.lower())
    ).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Account not found")
    ch = db.execute(
        select(Channel).where(Channel.slug == body.channel_slug.lower())
    ).scalar_one_or_none()
    if ch is None:
        raise HTTPException(status_code=404, detail="Channel not found")

    existing = db.get(ChannelMembership, (acc.id, ch.id))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Already a member (role={existing.role})",
        )

    cm = ChannelMembership(account_id=acc.id, channel_id=ch.id, role=body.role)
    db.add(cm)
    db.commit()
    db.refresh(cm)
    return MembershipOut(
        account_handle=acc.handle,
        channel_slug=ch.slug,
        role=cm.role,
        joined_at=cm.joined_at,
    )


@router.delete("/memberships/{account_id}/{channel_id}", status_code=204)
def remove_membership(
    account_id: str,
    channel_id: str,
    db: Session = Depends(get_session),
) -> None:
    try:
        aid = uuid.UUID(account_id)
        cid = uuid.UUID(channel_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    cm = db.get(ChannelMembership, (aid, cid))
    if cm is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    db.delete(cm)
    db.commit()


# --- Tokens ------------------------------------------------------------


@router.get("/tokens", response_model=list[TokenOut])
def list_tokens(
    account: str,
    db: Session = Depends(get_session),
) -> list[TokenOut]:
    acc = db.execute(
        select(Account).where(Account.handle == account.lower())
    ).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Account not found")
    rows = (
        db.execute(
            select(AgentToken)
            .where(AgentToken.account_id == acc.id)
            .order_by(AgentToken.created_at)
        )
        .scalars()
        .all()
    )
    return [_token_to_out(t, acc.handle) for t in rows]


@router.post("/tokens", response_model=IssuedTokenOut, status_code=201)
def issue_token(
    body: IssueTokenBody,
    db: Session = Depends(get_session),
) -> IssuedTokenOut:
    acc = db.execute(
        select(Account).where(Account.handle == body.account_handle.lower())
    ).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if acc.kind != "agent":
        raise HTTPException(status_code=400, detail="Tokens are for agents only")
    if not body.scopes:
        raise HTTPException(status_code=400, detail="At least one scope required")

    raw = generate_token()
    tok = AgentToken(
        account_id=acc.id,
        token_hash=sha256_hash(raw),
        scopes=body.scopes,
    )
    db.add(tok)
    db.commit()
    db.refresh(tok)

    return IssuedTokenOut(
        id=str(tok.id),
        account_handle=acc.handle,
        scopes=list(tok.scopes or []),
        created_at=tok.created_at,
        last_used_at=tok.last_used_at,
        revoked_at=tok.revoked_at,
        token=raw,
    )


@router.post("/tokens/{token_id}/revoke", response_model=TokenOut)
def revoke_token(
    token_id: str,
    db: Session = Depends(get_session),
) -> TokenOut:
    try:
        tid = uuid.UUID(token_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token id")
    tok = db.get(AgentToken, tid)
    if tok is None:
        raise HTTPException(status_code=404, detail="Token not found")
    if tok.revoked_at is None:
        tok.revoked_at = datetime.now(tz=timezone.utc)
        db.commit()
        db.refresh(tok)
    acc = db.get(Account, tok.account_id)
    return _token_to_out(tok, acc.handle if acc else "?")
