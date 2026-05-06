import { Link, NavLink, Outlet } from 'react-router-dom'
import { useMe, useLogout } from '../lib/auth'
import { ThemeToggle } from './ThemeToggle'
import { Wordmark } from './Wordmark'

/**
 * Two-column shell:
 *   - Header (slim, dotted-rule beneath): wordmark left, nav middle, user chip + theme right.
 *   - Sidebar (channel list — sparse for v1 with one channel).
 *   - Main outlet.
 */
export function AppLayout() {
  const { data: me } = useMe()
  const logout = useLogout()

  return (
    <div className="relative z-10 min-h-screen flex flex-col" style={{ color: 'var(--text)' }}>
      <header
        className="flex items-center justify-between px-6 py-3 sticky top-0 z-20 backdrop-blur"
        style={{
          background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
          borderBottom: '1px dashed var(--border-soft)',
        }}
      >
        <Link to="/" className="inline-flex items-center gap-3">
          <Wordmark size="md" />
        </Link>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          {me && (
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="ml-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors"
              style={{
                color: 'var(--text)',
                background: 'transparent',
                border: '1px solid var(--border-soft)',
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--accent)' }}
                aria-hidden
              />
              <span>{me.display_name}</span>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)' }}>sign out</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className="hidden w-60 shrink-0 px-5 py-6 md:block"
          style={{ borderRight: '1px solid var(--border-soft)' }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.2em] mb-3"
            style={{ color: 'var(--muted)' }}
          >
            Channels
          </p>
          <nav className="flex flex-col gap-0.5">
            <ChannelLink slug="family-ops" label="family-ops" />
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function ChannelLink({ slug, label }: { slug: string; label: string }) {
  return (
    <NavLink
      to={`/channels/${slug}`}
      className={({ isActive }) =>
        `group relative flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
          isActive ? 'font-medium' : ''
        }`
      }
      style={({ isActive }) =>
        ({
          color: isActive ? 'var(--text-strong)' : 'var(--text)',
          background: isActive ? 'var(--accent-soft)' : 'transparent',
        }) as React.CSSProperties
      }
    >
      <span className="font-mono">
        <span style={{ color: 'var(--accent-text)' }}>#</span>
        {label}
      </span>
    </NavLink>
  )
}
