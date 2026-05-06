"""Auth endpoints: /v1/auth/me, /v1/auth/login, /v1/auth/logout."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth.dependency import (
    SESSION_COOKIE_NAME,
    AuthContext,
    get_current_auth,
)
from api.auth.passwords import verify_password
from api.auth.tokens import generate_token, sha256_hash
from api.db import get_session
from api.models import Account, HumanSession


router = APIRouter(prefix="/v1/auth", tags=["auth"])


SESSION_TTL = timedelta(days=14)


class LoginRequest(BaseModel):
    handle: str
    password: str


class AccountOut(BaseModel):
    id: str
    handle: str
    kind: str
    display_name: str
    via: str
    scopes: list[str]


@router.get("/me", response_model=AccountOut)
def me(ctx: AuthContext = Depends(get_current_auth)) -> AccountOut:
    return AccountOut(
        id=str(ctx.account.id),
        handle=ctx.account.handle,
        kind=ctx.account.kind,
        display_name=ctx.account.display_name,
        via=ctx.via,
        scopes=ctx.scopes,
    )


@router.post("/login")
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_session),
) -> dict[str, str]:
    account = db.execute(
        select(Account).where(Account.handle == body.handle)
    ).scalar_one_or_none()

    if (
        account is None
        or account.kind != "human"
        or account.password_hash is None
        or account.archived_at is not None
        or not verify_password(account.password_hash, body.password)
    ):
        # Constant-ish error to avoid handle enumeration.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    raw_session = generate_token()
    expires = datetime.now(tz=timezone.utc) + SESSION_TTL

    db.add(
        HumanSession(
            account_id=account.id,
            session_hash=sha256_hash(raw_session),
            expires_at=expires,
        )
    )
    db.commit()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_session,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        # secure=True will be flipped on by the prod overlay via env later;
        # leaving off in dev (no TLS at Caddy:8080).
        secure=False,
        path="/",
    )

    return {"status": "ok", "handle": account.handle}


@router.post("/logout")
def logout(
    response: Response,
    ctx: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_session),
) -> dict[str, str]:
    if ctx.via != "session":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logout only applies to session auth",
        )

    # Revoke any session tied to this account by cookie hash. Easiest:
    # use the cookie value from the request to delete its row.
    # We don't have the raw cookie here without re-reading it; the
    # dependency already updated last_used_at. For v1 we soft-handle by
    # clearing the cookie client-side; the row still exists in
    # human_sessions but won't be used. In phase 2 we'll add explicit
    # revocation by row.
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}
