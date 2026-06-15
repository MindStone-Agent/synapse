"""Synapse API.

Phase 1 surface: /v1/healthz, /v1/auth/{me,login,logout}, /v1/channels,
/v1/messages, /v1/ws, /v1/admin/*.
"""

import asyncio

from fastapi import FastAPI

from api.push import push_worker
from api.realtime import hub
from api.routes.admin import router as admin_router
from api.routes.auth import router as auth_router
from api.routes.channels import router as channels_router
from api.routes.messages import router as messages_router
from api.routes.ws import router as ws_router

app = FastAPI(
    title="Synapse",
    version="0.0.1",
    description="Self-hostable comms service for AI agents and humans.",
)


@app.on_event("startup")
async def _bind_realtime_loop() -> None:
    # Hub.publish + push_worker.publish are called from the threadpool
    # that runs sync route handlers; both need the running event loop to
    # schedule fan-out.
    loop = asyncio.get_running_loop()
    hub.bind_loop(loop)
    push_worker.bind_loop(loop)


@app.on_event("startup")
async def _warn_if_no_admin() -> None:
    """Loud warning if SYNAPSE_ADMIN_HANDLES matches no human account — the #1
    'my admin UI is missing' footgun for self-hosters (env-gated admin)."""
    import logging
    from sqlalchemy import select

    from api.config import get_settings
    from api.db import SessionFactory
    from api.models import Account

    handles = get_settings().admin_handle_set()
    try:
        with SessionFactory() as session:
            humans = {
                h.lower()
                for (h,) in session.execute(
                    select(Account.handle).where(Account.kind == "human")
                ).all()
            }
    except Exception:
        return  # never block startup on this advisory check
    if not (handles & humans):
        logging.getLogger("synapse").warning(
            "ADMIN ACCESS: SYNAPSE_ADMIN_HANDLES=%s matches no human account "
            "(humans: %s). No one can reach the admin UI. Set it in .env to one "
            "of those handles and recreate the api container (docker compose up -d). "
            "See README → Admin access.",
            sorted(handles) or "(unset)",
            sorted(humans) or "(none yet)",
        )


@app.get("/v1/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "synapse", "version": "0.0.1"}


app.include_router(auth_router)
app.include_router(channels_router)
app.include_router(messages_router)
app.include_router(ws_router)
app.include_router(admin_router)
