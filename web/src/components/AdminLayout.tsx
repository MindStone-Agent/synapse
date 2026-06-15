import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/channels', label: 'Channels' },
  { to: '/admin/tokens', label: 'Tokens' },
]

export function AdminLayout() {
  return (
    <section className="h-[calc(100vh-65px)] overflow-y-auto">
      <header
        className="sticky top-0 z-10 px-8 py-4"
        style={{
          background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
          backdropFilter: 'blur(6px)',
          borderBottom: '1px solid var(--divider)',
        }}
      >
        <p
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--muted)' }}
        >
          admin
        </p>
        <nav className="mt-2 flex items-center gap-5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className="font-display text-2xl tracking-tight transition-colors"
              style={({ isActive }) => ({
                color: isActive ? 'var(--heading)' : 'var(--muted)',
                textDecoration: isActive ? 'none' : 'none',
                position: 'relative',
              })}
            >
              {({ isActive }) => (
                <>
                  {t.label}
                  {isActive && (
                    <span
                      className="absolute -bottom-1 left-0 right-0 h-[2px]"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="px-8 py-8">
        <Outlet />
      </div>
    </section>
  )
}
