/* WebSocket client for /v1/ws.
 *
 * One connection per channel. Same-origin so the synapse_session cookie
 * rides automatically. Auto-reconnects with exponential backoff capped
 * at 15s. Exposes the parsed envelope to the caller via onEvent.
 */

import { useEffect, useRef, useState } from 'react'

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface MessageCreatedEvent {
  type: 'message.created'
  channel: string
  message: import('./messages').Message
}

export interface HelloEvent {
  type: 'hello'
  channel: string
}

export type StreamEvent = HelloEvent | MessageCreatedEvent

interface UseChannelStreamOptions {
  enabled?: boolean
  onEvent: (event: StreamEvent) => void
}

const INITIAL_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 15_000
// Give up after this many consecutive failed attempts with no successful
// open in between. Browsers hide the handshake HTTP status from the WS
// API, so an auth/membership rejection (HTTP 403 from FastAPI's pre-accept
// close) reaches us as an opaque close — without this cap we'd loop.
const MAX_CONSECUTIVE_FAILURES = 5

function wsUrl(slug: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/v1/ws?channel=${encodeURIComponent(slug)}`
}

export function useChannelStream(
  slug: string,
  { enabled = true, onEvent }: UseChannelStreamOptions,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  // onEvent ref so reconnect doesn't depend on the caller memoizing.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled || !slug) return

    let ws: WebSocket | null = null
    let cancelled = false
    let backoff = INITIAL_BACKOFF_MS
    let consecutiveFailures = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (cancelled) return
      setStatus((s) => (s === 'open' ? s : 'connecting'))
      try {
        ws = new WebSocket(wsUrl(slug))
      } catch {
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        backoff = INITIAL_BACKOFF_MS
        consecutiveFailures = 0
        setStatus('open')
      }

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as StreamEvent
          onEventRef.current(data)
        } catch {
          // Malformed frame — ignore, the protocol is JSON-only.
        }
      }

      ws.onerror = () => {
        // The close handler will fire next; reconnect happens there.
      }

      ws.onclose = (ev) => {
        if (cancelled) return
        // 1008 (policy) — auth/membership rejected post-accept. Stop.
        if (ev.code === 1008) {
          setStatus('closed')
          return
        }
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Likely a persistent rejection (handshake 403) or the API is
          // wedged. Stop hammering; the user can refresh to retry.
          setStatus('closed')
          return
        }
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      setStatus('reconnecting')
      const delay = Math.min(backoff, MAX_BACKOFF_MS)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      reconnectTimer = setTimeout(connect, delay)
    }

    // When the tab is suspended (Mac sleep, aggressive background-tab
     // throttling, OS network handoff), the WS often dies at the OS level
     // without surfacing an `onclose` event to the suspended JS context.
     // When the tab becomes visible again, the connection is silently
     // dead — we'd otherwise stay in "live" until the user refreshes.
     //
     // On any "you're back" signal (visibilitychange-to-visible, focus,
     // online), force a fresh connection if we're not OPEN. We also
     // re-check on what we *think* is OPEN: a connection that was
     // half-closed at the OS layer reads as OPEN until we try to send.
    const wakeAndReconnect = () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') return
      if (ws && ws.readyState === WebSocket.OPEN) return
      // Cancel any pending backoff and reconnect immediately.
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      backoff = INITIAL_BACKOFF_MS
      consecutiveFailures = 0
      // Drop the stale handle so connect() doesn't think we have a live ws.
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        try {
          ws.close()
        } catch {
          // ignore
        }
        ws = null
      }
      connect()
    }

    document.addEventListener('visibilitychange', wakeAndReconnect)
    window.addEventListener('focus', wakeAndReconnect)
    window.addEventListener('online', wakeAndReconnect)

    connect()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', wakeAndReconnect)
      window.removeEventListener('focus', wakeAndReconnect)
      window.removeEventListener('online', wakeAndReconnect)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        try {
          ws.close()
        } catch {
          // already closed
        }
      }
      setStatus('closed')
    }
  }, [slug, enabled])

  return status
}
