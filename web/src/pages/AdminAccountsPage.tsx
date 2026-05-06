import { useState } from 'react'
import {
  useAdminAccounts,
  useArchiveAccount,
  useCreateAccount,
  useUnarchiveAccount,
} from '../lib/admin'
import { ApiError } from '../lib/api'
import { Modal } from '../components/Modal'
import { formatTimestamp } from '../lib/format'

export function AdminAccountsPage() {
  const accounts = useAdminAccounts()
  const archive = useArchiveAccount()
  const unarchive = useUnarchiveAccount()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm" style={{ color: 'var(--text)' }}>
          {accounts.data ? `${accounts.data.length} accounts` : 'Loading…'}
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="group relative inline-flex items-center gap-1.5 overflow-hidden px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em]"
          style={{
            background: 'var(--accent)',
            color: 'var(--ink-900)',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          <span className="relative">+ New account</span>
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
              <Th>Handle</Th>
              <Th>Display name</Th>
              <Th>Kind</Th>
              <Th>Created</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.data?.map((a, i) => (
              <tr
                key={a.id}
                style={{
                  borderBottom:
                    i === (accounts.data!.length - 1) ? 'none' : '1px solid var(--border-soft)',
                  opacity: a.archived_at ? 0.55 : 1,
                }}
              >
                <Td>
                  <span className="font-mono">
                    <span style={{ color: 'var(--accent-text)' }}>@</span>
                    {a.handle}
                  </span>
                </Td>
                <Td>{a.display_name}</Td>
                <Td>
                  <KindBadge kind={a.kind} />
                </Td>
                <Td>
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                    {formatTimestamp(a.created_at)}
                  </span>
                </Td>
                <Td>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{
                      color: a.archived_at ? 'var(--muted)' : 'var(--success)',
                    }}
                  >
                    {a.archived_at ? 'archived' : 'active'}
                  </span>
                </Td>
                <Td align="right">
                  {a.archived_at ? (
                    <RowAction onClick={() => unarchive.mutate(a.id)}>Unarchive</RowAction>
                  ) : (
                    <RowAction onClick={() => archive.mutate(a.id)}>Archive</RowAction>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {accounts.data && accounts.data.length === 0 && <EmptyState />}
      </div>

      <CreateAccountModal open={createOpen} onClose={() => setCreateOpen(false)} />
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

function RowAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[11px] uppercase tracking-[0.15em] transition-colors"
      style={{ color: 'var(--accent-text)' }}
    >
      {children}
    </button>
  )
}

function KindBadge({ kind }: { kind: 'human' | 'agent' }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color: 'var(--text)' }}
    >
      {kind}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="px-6 py-12 text-center" style={{ color: 'var(--muted)' }}>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em]">no accounts yet</p>
    </div>
  )
}

function CreateAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<'human' | 'agent'>('human')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateAccount()

  function reset() {
    setKind('human')
    setHandle('')
    setDisplayName('')
    setEmail('')
    setPassword('')
    setError(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function submit() {
    setError(null)
    try {
      await create.mutateAsync({
        kind,
        handle,
        display_name: displayName || undefined,
        email: email || null,
        password: kind === 'human' ? password : null,
      })
      close()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed')
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New account"
      footer={
        <>
          <button
            type="button"
            onClick={close}
            className="font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ color: 'var(--muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending || !handle}
            className="px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] disabled:opacity-50"
            style={{
              background: 'var(--accent)',
              color: 'var(--ink-900)',
              borderRadius: 'var(--radius-btn)',
            }}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Kind">
          <div className="flex gap-2">
            <KindToggle value="human" current={kind} onClick={() => setKind('human')} />
            <KindToggle value="agent" current={kind} onClick={() => setKind('agent')} />
          </div>
        </Field>
        <Field label="Handle (lowercase, used as @mention)">
          <Input value={handle} onChange={setHandle} mono />
        </Field>
        <Field label="Display name">
          <Input value={displayName} onChange={setDisplayName} placeholder={handle || 'optional'} />
        </Field>
        <Field label="Email (optional)">
          <Input value={email} onChange={setEmail} type="email" />
        </Field>
        {kind === 'human' && (
          <Field label="Password">
            <Input value={password} onChange={setPassword} type="password" />
          </Field>
        )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span
        className="block text-[10px] uppercase tracking-[0.18em] font-medium"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

function Input({
  value,
  onChange,
  type = 'text',
  mono = false,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  mono?: boolean
  placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-transparent px-3 py-2 text-sm ${mono ? 'font-mono' : ''}`}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-input)',
        color: 'var(--text-strong)',
      }}
    />
  )
}

function KindToggle({
  value,
  current,
  onClick,
}: {
  value: 'human' | 'agent'
  current: 'human' | 'agent'
  onClick: () => void
}) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-1.5"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent-text-bold)' : 'var(--muted)',
        border: '1px solid var(--border)',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        borderRadius: 'var(--radius-btn)',
      }}
    >
      {value}
    </button>
  )
}
