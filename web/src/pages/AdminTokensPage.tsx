import { useState } from 'react'
import {
  useAdminAccounts,
  useAdminTokens,
  useIssueToken,
  useRevokeToken,
  type IssuedToken,
} from '../lib/admin'
import { ApiError } from '../lib/api'
import { Modal } from '../components/Modal'
import { formatTimestamp } from '../lib/format'

export function AdminTokensPage() {
  const accounts = useAdminAccounts()
  const agents = (accounts.data ?? []).filter((a) => a.kind === 'agent' && !a.archived_at)
  const [selected, setSelected] = useState<string | null>(null)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issued, setIssued] = useState<IssuedToken | null>(null)

  // Default selection to first agent.
  if (selected == null && agents.length > 0) {
    setSelected(agents[0].handle)
  }

  const tokens = useAdminTokens(selected)
  const revoke = useRevokeToken(selected ?? '')

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            Agent
          </p>
          <select
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value || null)}
            className="font-mono bg-transparent px-3 py-1.5 text-sm"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          >
            <option value="">— pick an agent —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.handle}>
                @{a.handle}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setIssueOpen(true)}
          disabled={!selected}
          className="group relative inline-flex items-center gap-1.5 overflow-hidden px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] disabled:opacity-50"
          style={{
            background: 'var(--accent)',
            color: 'var(--ink-900)',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          <span className="relative">+ Issue token</span>
          <span
            aria-hidden
            className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: 'var(--accent-hover)' }}
          />
        </button>
      </div>

      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <Th>ID</Th>
              <Th>Scopes</Th>
              <Th>Created</Th>
              <Th>Last used</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {tokens.data?.map((t, i) => (
              <tr
                key={t.id}
                style={{
                  borderBottom:
                    i === (tokens.data!.length - 1) ? 'none' : '1px solid var(--border-soft)',
                  opacity: t.revoked_at ? 0.55 : 1,
                }}
              >
                <Td>
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                    {t.id.slice(0, 8)}…
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {t.scopes.map((s) => (
                      <span
                        key={s}
                        className="font-mono text-[11px] px-1.5 py-0.5"
                        style={{
                          background: 'var(--accent-soft)',
                          color: 'var(--accent-text-bold)',
                          borderRadius: '4px',
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                    {formatTimestamp(t.created_at)}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                    {t.last_used_at ? formatTimestamp(t.last_used_at) : '—'}
                  </span>
                </Td>
                <Td>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{
                      color: t.revoked_at ? 'var(--muted)' : 'var(--success)',
                    }}
                  >
                    {t.revoked_at ? 'revoked' : 'active'}
                  </span>
                </Td>
                <Td align="right">
                  {!t.revoked_at && (
                    <button
                      type="button"
                      onClick={() => revoke.mutate(t.id)}
                      className="font-mono text-[11px] uppercase tracking-[0.15em]"
                      style={{ color: 'var(--error)' }}
                    >
                      Revoke
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!tokens.data || tokens.data.length === 0) && selected && (
          <div className="px-6 py-12 text-center" style={{ color: 'var(--muted)' }}>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em]">
              no tokens for @{selected} yet
            </p>
          </div>
        )}
      </div>

      <IssueTokenModal
        open={issueOpen}
        accountHandle={selected}
        onClose={() => setIssueOpen(false)}
        onIssued={(t) => setIssued(t)}
      />

      <IssuedTokenModal token={issued} onClose={() => setIssued(null)} />
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`px-4 py-3 text-${align ?? 'left'} font-medium`}
      style={{
        color: 'var(--muted)',
        fontSize: '10px',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td
      className={`px-4 py-3 text-${align ?? 'left'} align-middle`}
      style={{ color: 'var(--text-strong)' }}
    >
      {children}
    </td>
  )
}

function IssueTokenModal({
  open,
  accountHandle,
  onClose,
  onIssued,
}: {
  open: boolean
  accountHandle: string | null
  onClose: () => void
  onIssued: (t: IssuedToken) => void
}) {
  const [scopesText, setScopesText] = useState('channel:family-ops:read,channel:family-ops:post')
  const [error, setError] = useState<string | null>(null)
  const issue = useIssueToken()

  async function submit() {
    if (!accountHandle) return
    setError(null)
    const scopes = scopesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (scopes.length === 0) {
      setError('At least one scope required')
      return
    }
    try {
      const t = await issue.mutateAsync({ account_handle: accountHandle, scopes })
      onIssued(t)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Issue token for @${accountHandle ?? '?'}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ color: 'var(--muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={issue.isPending}
            className="px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] disabled:opacity-50"
            style={{
              background: 'var(--accent)',
              color: 'var(--ink-900)',
              borderRadius: 'var(--radius-btn)',
            }}
          >
            {issue.isPending ? 'Issuing…' : 'Issue'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text)' }}>
          Comma-separated scopes. Wildcards supported (e.g.{' '}
          <code
            className="font-mono"
            style={{
              background: 'var(--bg-card)',
              padding: '1px 4px',
              borderRadius: '3px',
            }}
          >
            channel:*:read
          </code>
          ).
        </p>
        <label className="block space-y-1.5">
          <span
            className="block text-[10px] uppercase tracking-[0.18em] font-medium"
            style={{ color: 'var(--muted)' }}
          >
            Scopes
          </span>
          <input
            type="text"
            value={scopesText}
            onChange={(e) => setScopesText(e.target.value)}
            className="w-full bg-transparent px-3 py-2 text-sm font-mono"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
        </label>
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
      </div>
    </Modal>
  )
}

function IssuedTokenModal({
  token,
  onClose,
}: {
  token: IssuedToken | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  if (!token) return null

  function copy() {
    if (!token) return
    navigator.clipboard.writeText(token.token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Modal
      open={!!token}
      onClose={onClose}
      title="Token issued"
      width="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em]"
          style={{
            background: 'var(--accent)',
            color: 'var(--ink-900)',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          I've stored it — close
        </button>
      }
    >
      <div className="space-y-4">
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--text-strong)' }}
        >
          This is the only time the raw token is shown. Copy it now and store
          it where the agent can read it. After this dialog closes the token
          can only be referenced by ID and revoked — never re-displayed.
        </p>
        <div
          className="rounded-md p-3 font-mono text-xs break-all"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-strong)',
          }}
        >
          {token.token}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-1.5"
            style={{
              background: copied ? 'var(--accent-soft)' : 'transparent',
              color: copied ? 'var(--accent-text-bold)' : 'var(--accent-text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-btn)',
            }}
          >
            {copied ? '✓ copied' : 'Copy'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
