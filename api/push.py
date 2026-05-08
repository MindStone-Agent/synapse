"""Opt-in @-mention push (Phase 1 #4) — HMAC-signed webhook delivery.

Pull-not-push is Synapse's architectural default; this is a delivery
hint *on top* of the pull architecture. A push fires only when:

  1. The mentioned account has explicitly opted in (`push_enabled=True`)
  2. The message tags them via @handle (mention denorm)
  3. (Agents) a `push_webhook_url` and `push_webhook_secret` are configured

Delivery is at-most-once with bounded retries (3 attempts, exponential
backoff). On final failure, the message stays in the channel — the
agent's normal REST poll catches up via the `since` cursor. **Pull is
the source of truth; push is a hint.** This rule is load-bearing —
do not change it without understanding the loop-prevention implications.

Threadsafe by design: the sync POST handler in `routes/messages.py`
calls `worker.publish(...)` after committing, and we schedule the
async fan-out onto the event loop via `call_soon_threadsafe`. Same
pattern as `realtime.Hub`.

Per-account rate limiting:
  v1: in-memory sliding window, 60 deliveries/account/minute. Drops
  excess silently with a WARN log. Single-process limit; multi-process
  deployments would need Redis-backed rate limiting (Phase 3 / scale
  tier).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid as uuid_lib
from collections import deque
from typing import Any

import httpx


log = logging.getLogger(__name__)


class PushDeliveryWorker:
    """Webhook fan-out for opt-in @-mention push."""

    # Rate-limit: per-account sliding window of recent send timestamps.
    RATE_LIMIT_PER_MINUTE = 60
    RATE_WINDOW_SECONDS = 60.0

    # Retry: 3 attempts total, exp backoff in seconds between attempts.
    MAX_ATTEMPTS = 3
    BACKOFF_SECONDS = (1.0, 2.0, 4.0)

    # Network timeout per attempt.
    HTTP_TIMEOUT_SECONDS = 5.0

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._rate_buckets: dict[uuid_lib.UUID, deque[float]] = {}

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # --- Public API ----------------------------------------------------

    def publish(
        self,
        recipients: list[dict[str, Any]],
        event: dict[str, Any],
    ) -> None:
        """Threadsafe — fan out the event to opted-in agents.

        recipients: list of dicts with keys:
            - account_id: uuid
            - handle: str
            - webhook_url: str
            - secret: str (raw HMAC signing secret)
        event: the JSON-serializable payload (same envelope shape as the
            WebSocket `message.created` event).

        Returns immediately. Delivery happens asynchronously on the
        bound event loop. Never raises into the request path.
        """
        if not recipients:
            return
        loop = self._loop
        if loop is None:
            log.warning("PushDeliveryWorker.publish called before bind_loop; dropping")
            return
        loop.call_soon_threadsafe(self._dispatch_all, recipients, event)

    # --- Internals -----------------------------------------------------

    def _dispatch_all(
        self, recipients: list[dict[str, Any]], event: dict[str, Any]
    ) -> None:
        """Fire one async task per recipient. Runs on the event loop."""
        for r in recipients:
            asyncio.create_task(self._deliver_with_retries(r, event))

    def _check_rate_limit(self, account_id: uuid_lib.UUID) -> bool:
        """Returns True if the account is under the rate limit; False otherwise.

        Drops timestamps older than the window from the bucket, then
        checks the count. If under the limit, records the new send time.
        """
        now = time.monotonic()
        bucket = self._rate_buckets.setdefault(account_id, deque())
        cutoff = now - self.RATE_WINDOW_SECONDS
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.RATE_LIMIT_PER_MINUTE:
            return False
        bucket.append(now)
        return True

    async def _deliver_with_retries(
        self, recipient: dict[str, Any], event: dict[str, Any]
    ) -> None:
        """Send the webhook with bounded retries.

        Logs on each failure. On final failure, the message is unchanged
        in the channel — the recipient's REST poll catches up.
        """
        account_id = recipient["account_id"]
        handle = recipient["handle"]
        webhook_url = recipient["webhook_url"]
        secret = recipient["secret"]

        if not self._check_rate_limit(account_id):
            log.warning(
                "push: rate-limit hit for account=%s; dropping delivery", handle
            )
            return

        body = json.dumps(event, separators=(",", ":")).encode("utf-8")
        signature = hmac.new(
            secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
        delivery_id = str(uuid_lib.uuid4())

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Synapse-Webhook/1.0",
            "X-Synapse-Event": str(event.get("type", "unknown")),
            "X-Synapse-Delivery": delivery_id,
            "X-Synapse-Signature": f"sha256={signature}",
        }

        last_error: str | None = None
        async with httpx.AsyncClient(timeout=self.HTTP_TIMEOUT_SECONDS) as client:
            for attempt in range(self.MAX_ATTEMPTS):
                try:
                    resp = await client.post(
                        webhook_url, content=body, headers=headers
                    )
                    if 200 <= resp.status_code < 300:
                        log.info(
                            "push: delivered to %s (account=%s, status=%d, attempt=%d, delivery=%s)",
                            webhook_url,
                            handle,
                            resp.status_code,
                            attempt + 1,
                            delivery_id,
                        )
                        return
                    last_error = (
                        f"HTTP {resp.status_code}: {resp.text[:200] if resp.text else '(empty)'}"
                    )
                except httpx.HTTPError as e:
                    last_error = f"{type(e).__name__}: {e}"
                except Exception as e:
                    last_error = f"unexpected {type(e).__name__}: {e}"

                if attempt + 1 < self.MAX_ATTEMPTS:
                    backoff = self.BACKOFF_SECONDS[attempt]
                    log.warning(
                        "push: attempt %d/%d failed for %s (account=%s, delivery=%s): %s — retrying in %.1fs",
                        attempt + 1,
                        self.MAX_ATTEMPTS,
                        webhook_url,
                        handle,
                        delivery_id,
                        last_error,
                        backoff,
                    )
                    await asyncio.sleep(backoff)

        log.warning(
            "push: gave up after %d attempts for %s (account=%s, delivery=%s): %s",
            self.MAX_ATTEMPTS,
            webhook_url,
            handle,
            delivery_id,
            last_error,
        )


push_worker = PushDeliveryWorker()
