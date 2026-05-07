"""WebSocket route — Phase 1.

Humans only. Per the architecture invariant in project_synapse.md:
agents are pull-not-push; WebSocket is for the web UI.

Connection model: one WS per channel. The client opens
  wss://<host>/v1/ws?channel=<slug>
authenticated by the synapse_session cookie (same-origin browsers send
it automatically). The server validates read access, subscribes to the
hub for that channel, and forwards events as JSON until the client
disconnects.

Multi-channel multiplexing on a single socket lands in phase 2.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from api.auth.channel_access import assert_can_read_channel
from api.auth.dependency import SESSION_COOKIE_NAME, AuthContext, _resolve_session
from api.db import SessionFactory
from api.realtime import hub


log = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/v1/ws")
async def channel_stream(
    websocket: WebSocket,
    channel: str = Query(..., description="Channel slug to subscribe to"),
) -> None:
    # --- Auth (humans only) ----------------------------------------
    raw_session = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not raw_session:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="auth required")
        return

    db: Session = SessionFactory()
    try:
        try:
            ctx: AuthContext = _resolve_session(raw_session, db)
        except Exception:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION, reason="invalid session"
            )
            return

        if ctx.account.kind != "human":
            # Bearer-cookie hybrid wouldn't make sense; humans-only by design.
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION, reason="websocket is humans-only"
            )
            return

        try:
            chan, _ = assert_can_read_channel(ctx, channel, db)
        except Exception as e:
            # Membership / archive failures land here.
            code = (
                status.WS_1008_POLICY_VIOLATION
                if getattr(e, "status_code", 0) == 403
                else status.WS_1008_POLICY_VIOLATION
            )
            await websocket.close(code=code, reason=str(getattr(e, "detail", "denied")))
            return

        channel_id = chan.id
        channel_slug = chan.slug
    finally:
        db.close()

    # --- Subscribe + pump ------------------------------------------
    await websocket.accept()
    queue = await hub.subscribe(channel_id)

    # Greet so the client can flip its connection-status indicator.
    await websocket.send_json(
        {"type": "hello", "channel": channel_slug}
    )

    sender_task = asyncio.create_task(_pump_outgoing(websocket, queue))
    receiver_task = asyncio.create_task(_drain_incoming(websocket))

    try:
        done, pending = await asyncio.wait(
            {sender_task, receiver_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                log.warning("ws task error on channel=%s: %r", channel_slug, exc)
    finally:
        await hub.unsubscribe(channel_id, queue)
        try:
            await websocket.close()
        except Exception:
            pass


async def _pump_outgoing(websocket: WebSocket, queue: asyncio.Queue) -> None:
    """Forward published events from the hub to the WS as JSON."""
    while True:
        event = await queue.get()
        await websocket.send_json(event)


async def _drain_incoming(websocket: WebSocket) -> None:
    """Read & discard client messages.

    Phase 1 has no client→server protocol — but we must drain incoming
    frames to detect disconnects and so uvicorn's pong frames aren't
    backed up. Any unsolicited text/binary is silently ignored.
    """
    while True:
        # WebSocketDisconnect raises when the client goes away; the wrapping
        # task handler converts that into clean shutdown.
        await websocket.receive_text()
