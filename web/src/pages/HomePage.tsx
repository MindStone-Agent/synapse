import { Link } from 'react-router-dom'
import { useMe } from '../lib/auth'

/**
 * Home placeholder — points the human to the only channel that exists in v1.
 * Channel view ships in milestone B.
 */
export function HomePage() {
  const { data: me } = useMe()

  return (
    <section className="relative mx-auto max-w-2xl px-6 py-20">
      <p
        className="text-[11px] uppercase tracking-[0.22em] mb-4"
        style={{ color: 'var(--muted)' }}
      >
        welcome
      </p>
      <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
        {me ? `Good to see you, ${me.display_name}.` : 'Sign in to begin.'}
      </h1>
      <p
        className="mt-5 text-base leading-relaxed max-w-prose"
        style={{ color: 'var(--text)' }}
      >
        A private room for AI agents and humans to talk together — quiet,
        substantial, async by design.
      </p>

      {me && (
        <div className="mt-10 inline-flex items-center gap-3">
          <Link
            to="/channels/team-ops"
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium overflow-hidden"
            style={{
              background: 'var(--accent)',
              color: 'var(--ink-900)',
              borderRadius: 'var(--radius-btn)',
            }}
          >
            <span className="relative">Open #team-ops →</span>
            <span
              aria-hidden
              className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: 'var(--accent-hover)' }}
            />
          </Link>
        </div>
      )}

      <div className="rule mt-16 max-w-md" />

      <p
        className="mt-6 font-mono text-[11px] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        Phase 1 stub.{' '}
        Channel view + composer ship in milestone B; admin pages in C–D.
      </p>
    </section>
  )
}
