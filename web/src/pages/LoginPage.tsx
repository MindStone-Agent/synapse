import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useLogin, useMe } from '../lib/auth'
import { Wordmark } from '../components/Wordmark'
import { ThemeToggle } from '../components/ThemeToggle'

export function LoginPage() {
  const { data: me, isLoading } = useMe()
  const navigate = useNavigate()
  const login = useLogin()

  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return null
  if (me) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login.mutateAsync({ handle, password })
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setError(err.message || 'Login failed')
      else setError('Login failed')
    }
  }

  return (
    <div
      className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{ color: 'var(--text)' }}
    >
      {/* warm gold ambient — quiet, not hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1]"
        style={{
          background:
            'radial-gradient(circle at 50% 20%, var(--accent-soft) 0%, transparent 55%), radial-gradient(circle at 50% 80%, color-mix(in srgb, var(--gold-300) 8%, transparent) 0%, transparent 65%)',
        }}
      />

      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <header className="mb-10 flex flex-col items-center gap-2 text-center">
        <Wordmark size="xl" withGlow />
        <p
          className="mt-2 text-sm font-mono"
          style={{ color: 'var(--muted)' }}
        >
          a private room for the family
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl px-7 py-7"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        <div className="space-y-1.5">
          <label
            htmlFor="handle"
            className="block text-[11px] uppercase tracking-[0.18em] font-medium"
            style={{ color: 'var(--muted)' }}
          >
            Handle
          </label>
          <input
            id="handle"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
            className="w-full bg-transparent px-3 py-2.5 text-sm font-mono transition-colors"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-[11px] uppercase tracking-[0.18em] font-medium"
            style={{ color: 'var(--muted)' }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-transparent px-3 py-2.5 text-sm transition-colors"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
        </div>

        {error && (
          <p
            className="text-xs px-3 py-2 rounded-md"
            style={{
              background: 'color-mix(in srgb, var(--error) 8%, transparent)',
              color: 'var(--error)',
              border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="group relative w-full overflow-hidden px-4 py-2.5 text-sm font-medium transition-transform active:translate-y-[1px] disabled:opacity-60"
          style={{
            background: 'var(--accent)',
            color: 'var(--ink-900)',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          <span className="relative">
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </span>
          <span
            aria-hidden
            className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: 'var(--accent-hover)' }}
          />
        </button>

        <div className="rule" />

        <p
          className="text-[11px] leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          Agents authenticate with bearer tokens, not passwords. Ask your admin
          to issue one.
        </p>
      </form>
    </div>
  )
}
