import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useMe, useLogout } from '../lib/auth'
import { useMyChannels } from '../lib/messages'
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
  const channelsQuery = useMyChannels()

  // Sidebar collapse — persisted across sessions, default open.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('synapse:sidebar') !== 'closed'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('synapse:sidebar', sidebarOpen ? 'open' : 'closed')
    } catch {
      // ignore — private mode / storage disabled
    }
  }, [sidebarOpen])

  return (
    <div className="relative z-10 min-h-screen flex flex-col" style={{ color: 'var(--text)' }}>
      <header
        className="flex items-center justify-between px-6 py-3 sticky top-0 z-20 backdrop-blur"
        style={{
          background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
          borderBottom: '1px dashed var(--border-soft)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors"
            style={{ color: 'var(--muted)', border: '1px solid var(--border-soft)' }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
          <Link to="/" className="inline-flex items-center gap-3">
            <Wordmark size="md" />
          </Link>
        </div>

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
          className={`hidden w-60 shrink-0 px-5 py-6 ${sidebarOpen ? 'md:block' : ''}`}
          style={{ borderRight: '1px solid var(--border-soft)' }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.2em] mb-3"
            style={{ color: 'var(--muted)' }}
          >
            Channels
          </p>
          <nav className="flex flex-col gap-0.5">
            {channelsQuery.isLoading && (
              <span
                className="px-3 py-1.5 font-mono text-xs"
                style={{ color: 'var(--muted)' }}
              >
                loading…
              </span>
            )}
            {channelsQuery.isError && (
              // Fallback: API unreachable, keep family-ops link visible so
              // operator can always navigate to the default channel.
              <ChannelLink slug="family-ops" label="family-ops" />
            )}
            {channelsQuery.data?.channels
              ?.slice()
              .sort((a, b) => a.slug.localeCompare(b.slug))
              .map((ch) => <ChannelLink key={ch.slug} slug={ch.slug} label={ch.slug} />)}
            {channelsQuery.data && channelsQuery.data.channels.length === 0 && (
              <span
                className="px-3 py-1.5 font-mono text-xs"
                style={{ color: 'var(--muted)' }}
              >
                no channels
              </span>
            )}
          </nav>

          {me?.is_admin && (
            <>
              <p
                className="text-[10px] uppercase tracking-[0.2em] mt-8 mb-3"
                style={{ color: 'var(--muted)' }}
              >
                Admin
              </p>
              <nav className="flex flex-col gap-0.5">
                <SidebarLink to="/admin/accounts" label="Accounts" />
                <SidebarLink to="/admin/channels" label="Channels" />
                <SidebarLink to="/admin/tokens" label="Tokens" />
              </nav>
            </>
          )}
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

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${
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
      {label}
    </NavLink>
  )
}
