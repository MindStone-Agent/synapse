import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import emojiData from '@emoji-mart/data'
import EmojiPicker from '@emoji-mart/react'
import { ApiError } from '../lib/api'
import { usePostMessage, useChannelMembers, type Member } from '../lib/messages'
import { useTheme } from '../lib/theme'

interface Props {
  channelSlug: string
  meHandle: string
  onSent?: () => void
}

/**
 * Multi-line markdown composer with @mention autocomplete.
 *
 * Cmd/Ctrl+Enter sends. Plain Enter inserts a newline. Esc dismisses
 * the autocomplete dropdown if open.
 */
export function Composer({ channelSlug, meHandle, onSent }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPopoverRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [autocompleteToken, setAutocompleteToken] = useState<{
    start: number
    end: number
    prefix: string
  } | null>(null)
  const [acIndex, setAcIndex] = useState(0)

  const post = usePostMessage(channelSlug)
  const membersQuery = useChannelMembers(channelSlug)
  const { theme } = useTheme()

  // Insert emoji at the current cursor position in the textarea. Focus
  // returns to the textarea so further typing flows naturally.
  function insertEmoji(native: string) {
    const el = textareaRef.current
    if (!el) {
      setBody((prev) => prev + native)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + native + body.slice(end)
    setBody(next)
    const caret = start + native.length
    requestAnimationFrame(() => {
      const e2 = textareaRef.current
      if (!e2) return
      e2.focus()
      e2.setSelectionRange(caret, caret)
    })
  }

  // Close the picker on outside click or Escape.
  useEffect(() => {
    if (!showEmojiPicker) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (emojiPopoverRef.current?.contains(target)) return
      if (emojiButtonRef.current?.contains(target)) return
      setShowEmojiPicker(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setShowEmojiPicker(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showEmojiPicker])

  const candidates: Member[] = useMemo(() => {
    if (!autocompleteToken || !membersQuery.data) return []
    const prefix = autocompleteToken.prefix.toLowerCase()
    const all = membersQuery.data.members
    const filtered = prefix
      ? all.filter((m) => m.handle.toLowerCase().startsWith(prefix))
      : all
    // De-prioritize self.
    return filtered
      .filter((m) => m.handle !== meHandle)
      .slice(0, 6)
  }, [autocompleteToken, membersQuery.data, meHandle])

  // Reset selected index when candidates change.
  useEffect(() => {
    setAcIndex(0)
  }, [autocompleteToken?.prefix])

  // Auto-resize textarea.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [body])

  function detectMentionToken(value: string, caret: number) {
    // Walk backward from caret to find an active @ token.
    let i = caret - 1
    while (i >= 0 && /[a-zA-Z0-9_-]/.test(value[i])) i--
    if (i < 0 || value[i] !== '@') {
      setAutocompleteToken(null)
      return
    }
    // Don't trigger if @ is part of an email (preceded by a non-space word char).
    if (i > 0 && /\w/.test(value[i - 1])) {
      setAutocompleteToken(null)
      return
    }
    setAutocompleteToken({
      start: i,
      end: caret,
      prefix: value.slice(i + 1, caret),
    })
  }

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setBody(value)
    setError(null)
    detectMentionToken(value, e.target.selectionStart ?? value.length)
  }

  function applyMention(member: Member) {
    if (!autocompleteToken) return
    const before = body.slice(0, autocompleteToken.start)
    const after = body.slice(autocompleteToken.end)
    const next = `${before}@${member.handle} ${after}`
    setBody(next)
    setAutocompleteToken(null)
    // Move caret to just after the inserted handle + space.
    const caret = before.length + member.handle.length + 2
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  async function send() {
    const trimmed = body.trim()
    if (!trimmed || post.isPending) return
    try {
      await post.mutateAsync({ body: trimmed })
      setBody('')
      setError(null)
      setAutocompleteToken(null)
      onSent?.()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to send')
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (autocompleteToken && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcIndex((i) => (i + 1) % candidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcIndex((i) => (i - 1 + candidates.length) % candidates.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyMention(candidates[acIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAutocompleteToken(null)
        return
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="relative">
      {showEmojiPicker && (
        <div
          ref={emojiPopoverRef}
          className="absolute bottom-full mb-2 right-3 z-20 overflow-hidden rounded-md"
          style={{
            boxShadow: 'var(--shadow-pop)',
            // emoji-mart picker is ~360x435; keeping its own internal styling.
          }}
        >
          <EmojiPicker
            data={emojiData}
            theme={theme}
            previewPosition="none"
            skinTonePosition="search"
            onEmojiSelect={(e: { native?: string }) => {
              if (e.native) {
                insertEmoji(e.native)
              }
              setShowEmojiPicker(false)
            }}
          />
        </div>
      )}
      {autocompleteToken && candidates.length > 0 && (
        <div
          className="absolute bottom-full mb-2 left-3 z-10 min-w-[240px] overflow-hidden rounded-md"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-pop)',
          }}
          role="listbox"
        >
          {candidates.map((m, idx) => (
            <button
              type="button"
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault()
                applyMention(m)
              }}
              className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm"
              style={{
                background: idx === acIndex ? 'var(--accent-soft)' : 'transparent',
                color: 'var(--text-strong)',
              }}
              role="option"
              aria-selected={idx === acIndex}
            >
              <span>
                <span className="font-mono" style={{ color: 'var(--accent-text)' }}>
                  @
                </span>
                <span className="font-mono">{m.handle}</span>
                <span className="ml-2" style={{ color: 'var(--muted)' }}>
                  {m.display_name}
                </span>
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: 'var(--muted)' }}
              >
                {m.kind}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className="flex flex-col gap-2 rounded-lg px-3 py-3"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={body}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={`Message #${channelSlug} — Cmd+↩ to send`}
          rows={2}
          className="w-full resize-none bg-transparent text-[15px] leading-[1.55] outline-none placeholder:opacity-60"
          style={{ color: 'var(--text-strong)', fontFamily: 'inherit' }}
        />

        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
            {error ? (
              <span style={{ color: 'var(--error)' }}>{error}</span>
            ) : (
              <>
                <kbd className="font-mono">@</kbd> to mention ·{' '}
                <kbd className="font-mono">⌘↩</kbd> to send
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              ref={emojiButtonRef}
              onClick={() => setShowEmojiPicker((v) => !v)}
              aria-label="Insert emoji"
              aria-expanded={showEmojiPicker}
              className="inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
              style={{
                color: showEmojiPicker ? 'var(--accent-text-bold)' : 'var(--muted)',
                background: showEmojiPicker ? 'var(--accent-soft)' : 'transparent',
              }}
              title="Insert emoji"
            >
              <span aria-hidden style={{ fontSize: '17px', lineHeight: 1 }}>😀</span>
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!body.trim() || post.isPending}
              className="group relative inline-flex items-center gap-1.5 overflow-hidden px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition-transform active:translate-y-[1px] disabled:opacity-50"
              style={{
                background: 'var(--accent)',
                color: 'var(--ink-900)',
                borderRadius: 'var(--radius-btn)',
              }}
            >
              <span className="relative">{post.isPending ? 'Sending…' : 'Send'}</span>
              <span
                aria-hidden
                className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: 'var(--accent-hover)' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
