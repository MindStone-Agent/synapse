import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useMe } from '../lib/auth'
import { Composer } from '../components/Composer'
import { MessageBody } from '../components/MessageBody'
import { formatTimestamp, shouldGroup } from '../lib/format'
import { useChannelMessages, type Message } from '../lib/messages'

export function ChannelPage() {
  const { slug = 'family-ops' } = useParams<{ slug: string }>()
  const { data: me } = useMe()
  const { data: messages, isLoading, isError, error, refetch } = useChannelMessages(slug)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef<string | null>(null)

  // Auto-scroll to bottom when a new message arrives, unless the user
  // has scrolled up. (cheap test: within 80px of the bottom counts as
  // "at the bottom".)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !messages || messages.length === 0) return
    const newest = messages[messages.length - 1]
    if (newest.id === lastIdRef.current) return

    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    const wasAtBottom = distanceFromBottom < 80 || lastIdRef.current === null

    lastIdRef.current = newest.id
    if (wasAtBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  }, [messages])

  if (!me) return null

  return (
    <section className="flex h-[calc(100vh-65px)] flex-col">
      <ChannelHeader slug={slug} />

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-8 py-6"
        style={{ scrollbarColor: 'var(--border) transparent' }}
      >
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}
        {messages && messages.length === 0 && <EmptyState slug={slug} />}
        {messages && messages.length > 0 && (
          <MessageList messages={messages} meHandle={me.handle} />
        )}
      </div>

      <div className="px-8 pb-6 pt-2">
        <Composer channelSlug={slug} meHandle={me.handle} />
      </div>
    </section>
  )
}

function ChannelHeader({ slug }: { slug: string }) {
  return (
    <header
      className="px-8 py-4"
      style={{ borderBottom: '1px dashed var(--border-soft)' }}
    >
      <h1 className="font-mono text-base" style={{ color: 'var(--text-strong)' }}>
        <span style={{ color: 'var(--accent-text)' }}>#</span>
        {slug}
      </h1>
    </header>
  )
}

function MessageList({ messages, meHandle }: { messages: Message[]; meHandle: string }) {
  return (
    <ol className="mx-auto flex max-w-3xl flex-col gap-3 list-none p-0">
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : null
        const grouped = prev ? shouldGroup(prev, m) : false
        return <MessageRow key={m.id} message={m} meHandle={meHandle} grouped={grouped} />
      })}
    </ol>
  )
}

function MessageRow({
  message,
  meHandle,
  grouped,
}: {
  message: Message
  meHandle: string
  grouped: boolean
}) {
  const isMe = message.sender_handle === meHandle
  return (
    <li className={grouped ? 'pl-0' : 'pt-3'}>
      {!grouped && (
        <div className="mb-1 flex items-baseline gap-3">
          <span
            className="font-display text-base font-medium tracking-tight"
            style={{ color: 'var(--heading)' }}
          >
            {message.sender_handle}
            {message.sender_kind === 'agent' && (
              <span
                className="ml-2 font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: 'var(--muted)' }}
              >
                agent
              </span>
            )}
            {isMe && (
              <span
                className="ml-2 font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: 'var(--accent-text)' }}
              >
                you
              </span>
            )}
          </span>
          <span
            className="font-mono text-[11px]"
            style={{ color: 'var(--muted)' }}
            title={new Date(message.created_at).toISOString()}
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
