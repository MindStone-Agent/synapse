"""Admin CLI — invoked via `python -m api.admin <subcommand> [options]`.

Wrapped by scripts/bootstrap.sh so admins run e.g.:

    ./scripts/bootstrap.sh add-account --kind human --handle clint \
        --display-name "Clint" --password "..."

Subcommands:
    init                    run alembic upgrade head explicitly
    add-account             create a human or agent account
    seed-channel            create a channel
    add-member              add an account to a channel
    issue-token             issue a bearer token for an agent (raw printed once)
    revoke-token            revoke an agent token by id
    list-accounts           list all accounts (handle, kind, archived)
    list-channels           list all channels
    list-tokens             list tokens for an agent (no raw values; only metadata)

All commands operate against the engine configured by AGORA_DATABASE_URL.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from typing import Any

from sqlalchemy import select

from api.auth.passwords import hash_password
from api.auth.tokens import generate_token, sha256_hash
from api.db import SessionFactory, engine
from api.models import (
    Account,
    AgentToken,
    Channel,
    ChannelMembership,
)


# --- Helpers -----------------------------------------------------------


def _print(payload: Any) -> None:
    print(json.dumps(payload, indent=2, default=str))


def _account_by_handle(session, handle: str) -> Account:
    acc = session.execute(
        select(Account).where(Account.handle == handle)
    ).scalar_one_or_none()
    if acc is None:
        raise SystemExit(f"No account with handle {handle!r}")
    return acc


def _channel_by_slug(session, slug: str) -> Channel:
    ch = session.execute(
        select(Channel).where(Channel.slug == slug)
    ).scalar_one_or_none()
    if ch is None:
        raise SystemExit(f"No channel with slug {slug!r}")
    return ch


# --- Commands ----------------------------------------------------------


def cmd_init(_args: argparse.Namespace) -> int:
    """Run alembic upgrade head explicitly. (Container entrypoint already does this.)"""
    from alembic import command as alembic_cmd
    from alembic.config import Config

    cfg = Config("alembic.ini")
    alembic_cmd.upgrade(cfg, "head")
    print("Schema is at head.")
    return 0


def cmd_add_account(args: argparse.Namespace) -> int:
    if args.kind not in ("human", "agent"):
        raise SystemExit("--kind must be 'human' or 'agent'")
    if args.kind == "human" and not args.password:
        raise SystemExit("--password is required for human accounts")
    if args.kind == "agent" and args.password:
        raise SystemExit("Agents don't have passwords; they use bearer tokens")

    handle = args.handle.lower()
    with SessionFactory() as session:
        existing = session.execute(
            select(Account).where(Account.handle == handle)
        ).scalar_one_or_none()
        if existing is not None:
            raise SystemExit(f"Account with handle {handle!r} already exists")

        acc = Account(
            kind=args.kind,
            handle=handle,
            display_name=args.display_name or handle,
            email=args.email,
            password_hash=hash_password(args.password) if args.password else None,
        )
        session.add(acc)
        session.commit()

        _print(
            {
                "id": str(acc.id),
                "handle": acc.handle,
                "kind": acc.kind,
                "display_name": acc.display_name,
            }
        )
    return 0


def cmd_seed_channel(args: argparse.Namespace) -> int:
    slug = args.slug.lower()
    with SessionFactory() as session:
        existing = session.execute(
            select(Channel).where(Channel.slug == slug)
        ).scalar_one_or_none()
        if existing is not None:
            raise SystemExit(f"Channel {slug!r} already exists")

        ch = Channel(
            slug=slug,
            name=args.name,
            description=args.description,
            kind=args.kind,
        )
        session.add(ch)
        session.commit()

        _print({"id": str(ch.id), "slug": ch.slug, "name": ch.name, "kind": ch.kind})
    return 0


def cmd_add_member(args: argparse.Namespace) -> int:
    if args.role not in ("admin", "member", "read_only"):
        raise SystemExit("--role must be 'admin', 'member', or 'read_only'")

    with SessionFactory() as session:
        acc = _account_by_handle(session, args.handle.lower())
        ch = _channel_by_slug(session, args.channel.lower())

        existing = session.get(ChannelMembership, (acc.id, ch.id))
        if existing is not None:
            raise SystemExit(
                f"{acc.handle!r} is already a member of {ch.slug!r} (role={existing.role})"
            )

        session.add(
            ChannelMembership(account_id=acc.id, channel_id=ch.id, role=args.role)
        )
        session.commit()

        _print(
            {
                "account": acc.handle,
                "channel": ch.slug,
                "role": args.role,
            }
        )
    return 0


def cmd_issue_token(args: argparse.Namespace) -> int:
    scopes = [s.strip() for s in args.scopes.split(",") if s.strip()]
    if not scopes:
        raise SystemExit("--scopes must be a non-empty comma-separated list")

    with SessionFactory() as session:
        acc = _account_by_handle(session, args.account.lower())
        if acc.kind != "agent":
            raise SystemExit(f"{acc.handle!r} is not an agent (kind={acc.kind})")

        raw = generate_token()
        tok = AgentToken(
            account_id=acc.id,
            token_hash=sha256_hash(raw),
            scopes=scopes,
        )
        session.add(tok)
        session.commit()

        _print(
            {
                "id": str(tok.id),
                "account": acc.handle,
                "scopes": scopes,
                "token": raw,
                "_warning": "This is the only time the raw token is shown. Store it now.",
            }
        )
    return 0


def cmd_revoke_token(args: argparse.Namespace) -> int:
    try:
        tid = uuid.UUID(args.id)
    except ValueError:
        raise SystemExit(f"Not a valid UUID: {args.id!r}")

    with SessionFactory() as session:
        tok = session.get(AgentToken, tid)
        if tok is None:
            raise SystemExit(f"No token with id {tid}")
        if tok.revoked_at is not None:
            raise SystemExit("Token already revoked")

        from datetime import datetime, timezone

        tok.revoked_at = datetime.now(tz=timezone.utc)
        session.commit()
        _print({"id": str(tok.id), "revoked_at": tok.revoked_at.isoformat()})
    return 0


def cmd_list_accounts(_args: argparse.Namespace) -> int:
    with SessionFactory() as session:
        rows = session.execute(select(Account).order_by(Account.handle)).scalars().all()
        _print(
            [
                {
                    "id": str(a.id),
                    "handle": a.handle,
                    "kind": a.kind,
                    "display_name": a.display_name,
                    "archived": a.archived_at is not None,
                }
                for a in rows
            ]
        )
    return 0


def cmd_list_channels(_args: argparse.Namespace) -> int:
    with SessionFactory() as session:
        rows = session.execute(select(Channel).order_by(Channel.slug)).scalars().all()
        _print(
            [
                {
                    "id": str(c.id),
                    "slug": c.slug,
                    "name": c.name,
                    "kind": c.kind,
                    "archived": c.archived_at is not None,
                }
                for c in rows
            ]
        )
    return 0


def cmd_list_tokens(args: argparse.Namespace) -> int:
    with SessionFactory() as session:
        acc = _account_by_handle(session, args.account.lower())
        rows = (
            session.execute(
                select(AgentToken)
                .where(AgentToken.account_id == acc.id)
                .order_by(AgentToken.created_at)
            )
            .scalars()
            .all()
        )
        _print(
            [
                {
                    "id": str(t.id),
                    "scopes": t.scopes,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                    "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
                    "revoked_at": t.revoked_at.isoformat() if t.revoked_at else None,
                }
                for t in rows
            ]
        )
    return 0


# --- Argparse wiring ---------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="agora-admin", description="Agora admin CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="Run alembic upgrade head explicitly").set_defaults(
        fn=cmd_init
    )

    sp = sub.add_parser("add-account", help="Create a human or agent account")
    sp.add_argument("--kind", required=True, choices=["human", "agent"])
    sp.add_argument("--handle", required=True)
    sp.add_argument("--display-name")
    sp.add_argument("--email")
    sp.add_argument("--password")
    sp.set_defaults(fn=cmd_add_account)

    sp = sub.add_parser("seed-channel", help="Create a channel")
    sp.add_argument("slug")
    sp.add_argument("name")
    sp.add_argument("--description")
    sp.add_argument(
        "--kind", default="public", choices=["public", "private", "dm"]
    )
    sp.set_defaults(fn=cmd_seed_channel)

    sp = sub.add_parser("add-member", help="Add an account to a channel")
    sp.add_argument("handle")
    sp.add_argument("channel")
    sp.add_argument(
        "--role", default="member", choices=["admin", "member", "read_only"]
    )
    sp.set_defaults(fn=cmd_add_member)

    sp = sub.add_parser("issue-token", help="Issue an agent bearer token")
    sp.add_argument("--account", required=True, help="Agent handle")
    sp.add_argument(
        "--scopes",
        required=True,
        help="Comma-separated, e.g. 'channel:family-ops:read,channel:family-ops:post'",
    )
    sp.set_defaults(fn=cmd_issue_token)

    sp = sub.add_parser("revoke-token", help="Revoke an agent token")
    sp.add_argument("--id", required=True)
    sp.set_defaults(fn=cmd_revoke_token)

    sub.add_parser("list-accounts", help="List all accounts").set_defaults(
        fn=cmd_list_accounts
    )
    sub.add_parser("list-channels", help="List all channels").set_defaults(
        fn=cmd_list_channels
    )

    sp = sub.add_parser("list-tokens", help="List tokens for an agent")
    sp.add_argument("--account", required=True)
    sp.set_defaults(fn=cmd_list_tokens)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return int(args.fn(args))


if __name__ == "__main__":
    sys.exit(main())
