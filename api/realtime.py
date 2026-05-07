"""In-process pubsub for WebSocket fanout.

Phase 1: single FastAPI process, in-memory subscribers. Family-scale only.
Phase 3 (Brian's thousand-agent tier): swap the storage backend behind
this same interface for Redis pubsub or NATS — Hub stays the seam.

The publish path is called from sync route handlers (FastAPI runs `def`
handlers in a threadpool). To enqueue safely onto the event loop's
asyncio.Queues from a worker thread we use `loop.call_soon_threadsafe`.
The loop reference is bound once on FastAPI startup.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any


log = logging.getLogger(__name__)


class Hub:
    """Channel-keyed in-process pubsub.

    Lifecycle:
      - Construct once as a module-level singleton.
      - `bind_loop(loop)` from FastAPI startup so threaded publishers can
        schedule onto the right loop.
      - WebSocket handlers `subscribe(channel_id)` to get a Queue, drain
        it in a `while True: await queue.get()` loop, and `unsubscribe`
        in finally.
      - REST handlers call `publish(channel_id, event)` after committing.

    Queues are bounded so a slow consumer doesn't pin unbounded memory.
    On overflow we drop the oldest event for that subscriber and log —
    pull-not-push catchup via the `since` cursor recovers correctness.
    """

    QUEUE_MAXSIZE = 256

    def __init__(self) -> None:
        self._subscribers: dict[uuid.UUID, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def subscribe(self, channel_id: uuid.UUID) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=self.QUEUE_MAXSIZE)
        self._subscribers.setdefault(channel_id, set()).add(queue)
        return queue

    async def unsubscribe(
        self, channel_id: uuid.UUID, queue: asyncio.Queue[dict[str, Any]]
    ) -> None:
        subs = self._subscribers.get(channel_id)
        if not subs:
            return
        subs.discard(queue)
        if not subs:
            self._subscribers.pop(channel_id, None)

    def publish(self, channel_id: uuid.UUID, event: dict[str, Any]) -> None:
        """Threadsafe fan-out. Call from sync or async context.

        Returns immediately. If the loop isn't bound yet (shouldn't
        happen post-startup) the call is a no-op so we don't crash REST
        writes during an unusual lifecycle window.
        """
        loop = self._loop
        if loop is None:
            log.warning("Hub.publish called before bind_loop; dropping event")
            return
        loop.call_soon_threadsafe(self._dispatch, channel_id, event)

    def _dispatch(self, channel_id: uuid.UUID, event: dict[str, Any]) -> None:
        subs = self._subscribers.get(channel_id)
        if not subs:
            return
        for queue in list(subs):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop oldest, enqueue newest. Lossy under pressure is
                # acceptable here — clients reconcile via the REST `since`
                # cursor on reconnect.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    log.warning("Hub: dropped event for saturated subscriber")


hub = Hub()
