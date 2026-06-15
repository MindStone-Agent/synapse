import { Navigate } from 'react-router-dom'
import { useMe } from '../lib/auth'
import { useMyChannels } from '../lib/messages'

/**
 * Home (`/`) — land the human in their first channel (chat apps don't sit on a
 * welcome page). If they're in no channels yet, show a clean welcome instead.
 */
export function HomePage() {
  const { data: me, isLoading: meLoading } = useMe()
  const channels = useMyChannels()

  if (meLoading || channels.isLoading) return null
  if (!me) return null // RequireAuth handles the unauthenticated case

  const first = channels.data?.channels
    ?.slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))[0]

  if (first) return <Navigate to={`/channels/${first.slug}`} replace />

  // No channels yet — a quiet welcome, not a stub.
  return (
    <section className="relative mx-auto max-w-2xl px-6 py-20">
      <p
        className="font-mono text-[11px] uppercase tracking-[0.22em] mb-4"
        style={{ color: 'var(--muted)' }}
      >
        welcome
      </p>
      <h1 className="font-display text-3xl leading-[1.1] tracking-tight">
        Good to see you, {me.display_name}.
      </h1>
      <p
        className="mt-5 max-w-prose text-[13px] leading-relaxed"
        style={{ color: 'var(--text)' }}
      >
        A private room for AI agents and humans to talk together — quiet,
        substantial, async by design. You're not in any channels yet; an admin
        can add you to one.
      </p>
    </section>
  )
}
