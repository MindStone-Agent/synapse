import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const widthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export function Modal({ open, onClose, title, children, footer, width = 'md' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'color-mix(in srgb, var(--ink-900) 30%, transparent)',
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full ${widthMap[width]} rounded-lg overflow-hidden`}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        <header
          className="flex items-baseline justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-soft)' }}
        >
          <h2
            id="modal-title"
            className="font-display text-lg tracking-tight"
            style={{ color: 'var(--heading)' }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            close
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
        {footer && (
          <footer
            className="flex items-center justify-end gap-3 px-5 py-3"
            style={{
              borderTop: '1px solid var(--border-soft)',
              background: 'var(--bg-card)',
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
