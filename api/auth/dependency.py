"""FastAPI dependency: resolve the calling account.

Two auth paths:
  1. Bearer token in Authorization header → AgentToken lookup
  2. Session cookie (`agora_session`) → HumanSession lookup

Both update last_used_at on success. Both raise 401 on failure.

Scope handling: agent tokens carry a scopes list. `require_scope(...)`
returns a sub-dependency that enforces a specific scope on top of
authentication.
"""

from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth.tokens import sha256_hash
from api.db import get_session
from api.models import Account, AgentToken, HumanSession


SESSION_COOKIE_NAME = "agora_session"


class AuthContext:
    """The result of resolving the caller. Carries the account + scope info."""

    def __init__(
        self,
        *,
        account: Account,
        scopes: list[str] | None = None,
        via: str,
    ) -> None:
        self.account = account
        self.scopes = scopes or []  # empty for humans (no scope-bound sessions)
        self.via = via  # "bearer" or "session"

    def has_scope(self, scope: str) -> bool:
        if self.account.kind == "human":
            # Humans default to full access (channel-level RBAC enforced separately).
            return True
        # Wildcard support: "channel:*:read" satisfies "channel:family-ops:read".
        for granted in self.scopes:
            if granted == scope or granted == "admin:*":
                return True
            if _scope_matches(granted, scope):
                return True
        return False


def _scope_matches(granted: str, requested: str) -> bool:
    """Wildcard-aware scope match.

    Examples:
      granted='channel:*:read', requested='channel:family-ops:read' → True
      granted='channel:family-ops:*', requested='channel:family-ops:post' → True
      granted='dm:*:*', requested='dm:abc-123:post' → True
    """
    g = granted.split(":")
    r = requested.split(":")
    if len(g) != len(r):
        return False
    return all(gp == "*" or gp == rp for gp, rp in zip(g, r, strict=True))


def get_current_auth(
    authorization: str | None = Header(default=None),
    agora_session: str | None = Cookie(default=None),
    db: Session = Depends(get_session),
) -> AuthContext:
    """Resolve the calling account. Bearer token wins if both are present."""

    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(None, 1)[1].strip()
        return _resolve_bearer(raw, db)

    if agora_session:
        return _resolve_session(agora_session, db)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def _resolve_bearer(raw: str, db: Session) -> AuthContext:
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    h = sha256_hash(raw)
    token = db.execute(
        select(AgentToken).where(AgentToken.token_hash == h)
    ).scalar_one_or_none()

    if token is None or token.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    account = db.get(Account, token.account_id)
    if account is None or account.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")

    token.last_used_at = datetime.now(tz=timezone.utc)
    db.commit()

    return AuthContext(account=account, scopes=token.scopes or [], via="bearer")


def _resolve_session(raw: str, db: Session) -> AuthContext:
    h = sha256_hash(raw)
    sess = db.execute(
        select(HumanSession).where(HumanSession.session_hash == h)
    ).scalar_one_or_none()

    if sess is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    now = datetime.now(tz=timezone.utc)
    expires = sess.expires_at
    # SQLite returns naive datetimes; assume UTC.
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    account = db.get(Account, sess.account_id)
    if account is None or account.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")

    sess.last_used_at = now
    db.commit()

    return AuthContext(account=account, scopes=[], via="session")


def require_scope(scope: str) -> Callable[[AuthContext], AuthContext]:
    """Return a dependency that enforces a specific scope on the resolved auth."""

    def _check(ctx: AuthContext = Depends(get_current_auth)) -> AuthContext:
        if not ctx.has_scope(scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient scope")
        return ctx

    return _check


def require_admin(ctx: AuthContext = Depends(get_current_auth)) -> AuthContext:
    """System-admin gate.

    Humans: handle must appear in AGORA_ADMIN_HANDLES (env-driven).
    Agents: bearer token must include the `admin:*` scope.
    """
    from api.config import get_settings

    if ctx.account.kind == "agent":
        if not ctx.has_scope("admin:*"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Agent token lacks admin:* scope",
            )
        return ctx

    # Human path
    admins = get_settings().admin_handle_set()
    if ctx.account.handle.lower() not in admins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a system admin",
        )
    return ctx
