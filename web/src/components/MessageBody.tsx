import { Fragment } from 'react'

/**
 * Render a message body with @mentions highlighted. Mentions of the
 * current user get the gold-pill treatment; other mentions are
 * gold-text only.
 *
 * Markdown is intentionally NOT rendered in v1 — chat needs predictable
 * line-break behavior more than it needs styled quotes/code blocks. We'll
 * add markdown via a sandboxed renderer in phase 2.
 */
export function MessageBody({ body, meHandle }: { body: string; meHandle: string }) {
  const tokens = parseBody(body)
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.55]" style={{ color: 'var(--text-strong)' }}>
      {tokens.map((t, i) =>
        t.type === 'mention' ? (
          <Mention key={i} handle={t.handle} isMe={t.handle.toLowerCase() === meHandle.toLowerCase()} />
        ) : (
          <Fragment key={i}>{t.text}</Fragment>
        ),
      )}
    </p>
  )
}

interface MentionProps {
  handle: string
  isMe: boolean
}

function Mention({ handle, isMe }: MentionProps) {
  if (isMe) {
    return (
      <span
        className="font-mono"
        style={{
          color: 'var(--accent-text-bold)',
          background: 'var(--accent-soft)',
          padding: '0.5px 4px',
          borderRadius: '4px',
          fontWeight: 600,
        }}
      >
        @{handle}
      </span>
    )
  }
  return (
    <span className="font-mono font-medium" style={{ color: 'var(--accent-text)' }}>
      @{handle}
    </span>
  )
}

type Token =
  | { type: 'text'; text: string }
  | { type: 'mention'; handle: string }

const MENTION_RE = /(?<![\w])@([a-zA-Z][a-zA-Z0-9_-]{0,63})/g

function parseBody(body: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index ?? 0
    if (start > cursor) tokens.push({ type: 'text', text: body.slice(cursor, start) })
    tokens.push({ type: 'mention', handle: match[1] })
    cursor = start + match[0].length
  }
  if (cursor < body.length) tokens.push({ type: 'text', text: body.slice(cursor) })
  return tokens
}
