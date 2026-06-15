import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMe } from '../lib/auth'
import { Composer } from '../components/Composer'
import { MessageBody } from '../components/MessageBody'
import { formatTimestamp, parseTimestamp, shouldGroup } from '../lib/format'
import { useChannelLiveSync, useChannelMessages, type Message } from '../lib/messages'
import type { StreamStatus } from '../lib/realtime'

// Per-channel last-read marker (the created_at of the newest message the
// reader has seen). Persisted so the unread divider survives navigation and
// reloads.
const lastReadKey = (slug: string) => `synapse:lastread:${slug}`
function getLastRead(slug: string): string | null {
  try {
    return localStorage.getItem(lastReadKey(slug))
  } catch {
    return null
  }
}
function setLastRead(slug: string, isoTs: string): void {
  try {
    localStorage.setItem(lastReadKey(slug), isoTs)
  } catch {
    // storage disabled / private mode — degrade to in-session only
  }
}

export function ChannelPage() {
  const { slug = 'team-ops' } = useParams<{ slug: string }>()
  const { data: me } = useMe()
  const { data: messages, isLoading, isError, error, refetch } = useChannelMessages(slug)
  const streamStatus = useChannelLiveSync(slug)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef<string | null>(null)

  // Unread divider: id of the first message the reader hasn't seen, or null
  // when caught up. Per-channel last-read is persisted (localStorage), so on
  // entering a channel the marker sits at the first message since the last
  // visit. `lastReadIdRef` tracks the newest message seen this session, for
  // anchoring live arrivals.
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null)
  const lastReadIdRef = useRef<string | null>(null)
  const seededSlugRef = useRef<string | null>(null)
  const pendingMarkerScrollRef = useRef(false)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !messages || messages.length === 0) return
    const newest = messages[messages.length - 1]

    // New channel → clear the "first load" sentinel so this run re-seeds the
    // marker from the persisted last-read position (ref-only; no state reset).
    if (seededSlugRef.current !== slug) {
      seededSlugRef.current = slug
      lastIdRef.current = null
    }
    if (newest.id === lastIdRef.current) return

    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    const firstLoad = lastIdRef.current === null
    const wasAtBottom = distanceFromBottom < 80 || firstLoad
    lastIdRef.current = newest.id
    let scrollToMarker = false

    if (firstLoad) {
      // Entering the channel: place the divider at the first message since the
      // persisted last-read, and scroll to it (handled by the layout effect).
      const lastReadTs = getLastRead(slug)
      const firstUnread = lastReadTs
        ? (messages.find((m) => m.created_at > lastReadTs) ?? null)
        : null
      if (firstUnread) {
        const idx = messages.findIndex((m) => m.id === firstUnread.id)
        lastReadIdRef.current = messages[idx - 1]?.id ?? null
        scrollToMarker = true
        pendingMarkerScrollRef.current = true
        setFirstUnreadId(firstUnread.id)
      } else {
        lastReadIdRef.current = newest.id
        setLastRead(slug, newest.created_at)
        setFirstUnreadId(null)
      }
    } else if (wasAtBottom && !document.hidden) {
      // Reader is at the bottom — caught up; mark read, no divider.
      lastReadIdRef.current = newest.id
      setLastRead(slug, newest.created_at)
      setFirstUnreadId(null)
    } else {
      // New messages while scrolled up / tab hidden — anchor the divider at the
      // first unseen message, keeping an existing anchor if still valid.
      setFirstUnreadId((current) => {
        if (current && messages.some((m) => m.id === current)) return current
        const lastReadIdx = messages.findIndex((m) => m.id === lastReadIdRef.current)
        return messages[lastReadIdx + 1]?.id ?? newest.id
      })
    }

    if (wasAtBottom && !scrollToMarker) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  }, [messages, slug])

  // Scroll to the freshly-seeded unread marker once it has rendered.
  // useLayoutEffect runs after the DOM commit and before paint, so no jump.
  useLayoutEffect(() => {
    if (!pendingMarkerScrollRef.current) return
    const el = scrollerRef.current
    if (!el) return
    const marker = el.querySelector('[data-unread-divider]') as HTMLElement | null
    if (!marker) return
    pendingMarkerScrollRef.current = false
    marker.scrollIntoView({ block: 'center' })
  }, [firstUnreadId])

  // Clear the unread divider + advance last-read once the reader reaches the
  // bottom (caught up).
  function handleScroll() {
    const el = scrollerRef.current
    if (!el || !messages || messages.length === 0) return
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    if (distanceFromBottom < 80) {
      const newest = messages[messages.length - 1]
      lastReadIdRef.current = newest.id
      setLastRead(slug, newest.created_at)
      if (firstUnreadId !== null) setFirstUnreadId(null)
    }
  }

  if (!me) return null

  return (
    <section className="flex h-[calc(100vh-65px)] flex-col">
      <ChannelHeader slug={slug} streamStatus={streamStatus} />

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-8 py-6"
        style={{ scrollbarColor: 'var(--border) transparent' }}
      >
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}
        {messages && messages.length === 0 && <EmptyState slug={slug} />}
        {messages && messages.length > 0 && (
          <MessageList messages={messages} meHandle={me.handle} firstUnreadId={firstUnreadId} />
        )}
      </div>

      <div className="px-8 pb-6 pt-2">
        <Composer channelSlug={slug} meHandle={me.handle} />
      </div>
    </section>
  )
}

function ChannelHeader({
  slug,
  streamStatus,
}: {
  slug: string
  streamStatus: StreamStatus
}) {
  return (
    <header
      className="flex items-center justify-between px-8 py-4"
      style={{ borderBottom: '1px solid var(--divider)' }}
    >
      <h1 className="font-mono text-base" style={{ color: 'var(--text-strong)' }}>
        <span style={{ color: 'var(--accent-text)' }}>#</span>
        {slug}
      </h1>
      <StreamIndicator status={streamStatus} />
    </header>
  )
}

function StreamIndicator({ status }: { status: StreamStatus }) {
  // Editorial-quiet: a tiny dot + label. Gold when live, muted otherwise.
  const live = status === 'open'
  const label =
    status === 'open'
      ? 'live'
      : status === 'connecting'
        ? 'connecting…'
        : status === 'reconnecting'
          ? 'reconnecting…'
          : 'offline'
  return (
    <span
      className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{ color: live ? 'var(--accent-text)' : 'var(--muted)' }}
      aria-live="polite"
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: live ? 'var(--accent-text)' : 'var(--muted)',
          opacity: live ? 1 : 0.5,
        }}
      />
      {label}
    </span>
  )
}

function MessageList({
  messages,
  meHandle,
  firstUnreadId,
}: {
  messages: Message[]
  meHandle: string
  firstUnreadId: string | null
}) {
  return (
    <ol className="mx-auto flex max-w-3xl flex-col list-none p-0">
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : null
        const grouped = prev ? shouldGroup(prev, m) : false
        // First message in the list (no prev) doesn't get a leading divider;
        // every non-grouped message after the first does.
        const showDivider = prev !== null && !grouped
        const showUnread = firstUnreadId !== null && m.id === firstUnreadId
        return (
          <MessageRow
            key={m.id}
            message={m}
            meHandle={meHandle}
            grouped={grouped}
            showDivider={showDivider}
            showUnread={showUnread}
          />
        )
      })}
    </ol>
  )
}

function MessageRow({
  message,
  meHandle,
  grouped,
  showDivider,
  showUnread,
}: {
  message: Message
  meHandle: string
  grouped: boolean
  showDivider: boolean
  showUnread: boolean
}) {
  const isMe = message.sender_handle === meHandle
  return (
    <li className={grouped ? 'pt-1' : 'pt-3'}>
      {showUnread ? (
        <div
          data-unread-divider
          className="mb-3 mt-1 flex items-center gap-3"
          role="separator"
          aria-label="New messages"
        >
          <span className="h-px flex-1" style={{ background: 'var(--accent-text)' }} />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--accent-text)' }}
          >
            new messages
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--accent-text)' }} />
        </div>
      ) : (
        showDivider && (
          <hr
            className="mb-3 border-0"
            style={{ borderTop: '1px solid var(--divider)' }}
          />
        )
      )}
      {!grouped && (
        <div className="mb-1.5 flex items-baseline gap-3">
          <span
            className="font-mono text-[13px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: isMe ? 'var(--accent-text-bold)' : 'var(--heading)' }}
          >
            {message.sender_handle}
          </span>
          {message.sender_kind === 'agent' && (
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--muted)' }}
            >
              agent
            </span>
          )}
          {isMe && (
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--accent-text)' }}
            >
              you
            </span>
          )}
          <span
            className="ml-auto font-mono text-[11px]"
            style={{ color: 'var(--muted)' }}
            title={parseTimestamp(message.created_at).toISOString()}
          >
            {formatTimestamp(message.created_at)}
          </span>
        </div>
      )}
      <MessageBody body={message.body} meHandle={meHandle} />
    </li>
  )
}

function LoadingState() {
  return (
    <p
      className="font-mono text-[11px] uppercase tracking-[0.18em]"
      style={{ color: 'var(--muted)' }}
    >
      loading messages…
    </p>
  )
}

function EmptyState({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p
        className="font-mono text-[10px] uppercase tracking-[0.22em] mb-3"
        style={{ color: 'var(--muted)' }}
      >
        nothing yet
      </p>
      <h2 className="font-display text-2xl tracking-tight" style={{ color: 'var(--heading)' }}>
        #{slug} is quiet.
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--text)' }}>
        Say something — agents will pick it up on their next poll.
      </p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p
        className="font-mono text-[10px] uppercase tracking-[0.22em] mb-3"
        style={{ color: 'var(--error)' }}
      >
        could not load
      </p>
      <p className="text-sm" style={{ color: 'var(--text)' }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center px-3 py-1.5 text-xs font-medium"
        style={{
          background: 'var(--accent-soft)',
          color: 'var(--accent-text-bold)',
          borderRadius: 'var(--radius-btn)',
        }}
      >
        Retry
      </button>
    </div>
  )
}
