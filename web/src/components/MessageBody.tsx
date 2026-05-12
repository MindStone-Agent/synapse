import { Children, Fragment, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render a message body as markdown with @mention highlighting.
 *
 * Markdown is rendered via react-markdown (returns React elements, not
 * raw HTML — sandboxed by default) with remark-gfm for tables, task
 * lists, strikethrough, and autolinks.
 *
 * @-mentions are not part of markdown — we walk the rendered children
 * after markdown parsing and replace mention substrings inside any
 * text nodes with <Mention> components. Mentions of the current user
 * get the gold-pill treatment; other mentions are gold-text only.
 *
 * Custom component renderers keep the aesthetic tactical/terminal: code
 * blocks feel like terminal output (mono, subtle surface bg), blockquotes
 * get a left accent rail, no consumer-y blog-prose styling.
 */
export function MessageBody({ body, meHandle }: { body: string; meHandle: string }) {
  return (
    <div className="text-[15px] leading-[1.55] break-words" style={{ color: 'var(--text-strong)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{withMentions(children, meHandle)}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'var(--accent-text)' }}
            >
              {withMentions(children, meHandle)}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold" style={{ color: 'var(--text-strong)' }}>
              {withMentions(children, meHandle)}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{withMentions(children, meHandle)}</em>,
          del: ({ children }) => (
            <del style={{ color: 'var(--muted)' }}>{withMentions(children, meHandle)}</del>
          ),
          code: ({ children, className }) => {
            // ReactMarkdown distinguishes inline code (no className) vs fenced (with `language-x`).
            const isBlock = typeof className === 'string' && className.startsWith('language-')
            if (isBlock) {
              return (
                <code className="font-mono text-[13px]" style={{ color: 'var(--text-strong)' }}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="font-mono text-[13px] px-1 py-0.5 rounded"
                style={{
                  background: 'var(--surface-2, rgba(255,255,255,0.06))',
                  color: 'var(--text-strong)',
                }}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre
              className="my-2 overflow-x-auto rounded p-3 font-mono text-[13px] leading-[1.5]"
              style={{
                background: 'var(--surface-2, rgba(255,255,255,0.06))',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
              }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="my-2 pl-3 italic"
              style={{
                borderLeft: '2px solid var(--accent-text)',
                color: 'var(--text)',
              }}
            >
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{withMentions(children, meHandle)}</li>,
          h1: ({ children }) => (
            <h1 className="my-2 font-display text-lg font-semibold tracking-tight" style={{ color: 'var(--heading)' }}>
              {withMentions(children, meHandle)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="my-2 font-display text-base font-semibold tracking-tight" style={{ color: 'var(--heading)' }}>
              {withMentions(children, meHandle)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="my-2 font-display text-base font-medium tracking-tight" style={{ color: 'var(--heading)' }}>
              {withMentions(children, meHandle)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="my-2 font-display text-sm font-medium tracking-tight" style={{ color: 'var(--heading)' }}>
              {withMentions(children, meHandle)}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="my-2 font-display text-sm font-medium" style={{ color: 'var(--heading)' }}>
              {withMentions(children, meHandle)}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="my-2 font-display text-sm" style={{ color: 'var(--heading)' }}>
              {withMentions(children, meHandle)}
            </h6>
          ),
          hr: () => (
            <hr
              className="my-3 border-0"
              style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.10))' }}
            />
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="border-collapse text-[14px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="px-2 py-1 text-left font-semibold"
              style={{
                borderBottom: '1px solid var(--border, rgba(255,255,255,0.15))',
                color: 'var(--heading)',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="px-2 py-1"
              style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}
            >
              {withMentions(children, meHandle)}
            </td>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Walk a React children tree and replace @mention substrings in any string
 * leaves with <Mention> components. Recurses into element children so
 * mentions inside <strong>, <em>, <li>, <td>, etc. all get highlighted.
 *
 * `code` and `pre` elements are intentionally NOT recursed — we don't want
 * `@handle` inside a code block to be re-styled.
 */
function withMentions(children: ReactNode, meHandle: string): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === 'string') {
      return renderTextWithMentions(child, meHandle, idx)
    }
    if (!isValidElement(child)) {
      return child
    }
    // Don't re-process code/pre — preserve verbatim content.
    const type = (child as { type?: unknown }).type
    if (typeof type === 'string' && (type === 'code' || type === 'pre')) {
      return child
    }
    return child
  })
}

/**
 * Tokenize a string into text + mention spans. Returns an array of React
 * nodes suitable for inline use.
 */
function renderTextWithMentions(text: string, meHandle: string, keyPrefix: number | string): ReactNode {
  const out: ReactNode[] = []
  let cursor = 0
  let i = 0
  for (const match of text.matchAll(MENTION_RE)) {
    const start = match.index ?? 0
    if (start > cursor) {
      out.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(cursor, start)}</Fragment>)
      i++
    }
    const handle = match[1]
    out.push(
      <Mention
        key={`${keyPrefix}-m${i}`}
        handle={handle}
        isMe={handle.toLowerCase() === meHandle.toLowerCase()}
      />,
    )
    i++
    cursor = start + match[0].length
  }
  if (cursor < text.length) {
    out.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(cursor)}</Fragment>)
  }
  return out
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

const MENTION_RE = /(?<![\w])@([a-zA-Z][a-zA-Z0-9_-]{0,63})/g
