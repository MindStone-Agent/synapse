import { useState } from 'react'
import {
  useAddMembership,
  useAdminAccounts,
  useAdminChannels,
  useArchiveChannel,
  useCreateChannel,
  useUnarchiveChannel,
  type AdminChannel,
} from '../lib/admin'
import { ApiError } from '../lib/api'
import { Modal } from '../components/Modal'
import { formatTimestamp } from '../lib/format'

export function AdminChannelsPage() {
  const channels = useAdminChannels()
  const archive = useArchiveChannel()
  const unarchive = useUnarchiveChannel()
  const [createOpen, setCreateOpen] = useState(false)
  const [memberFor, setMemberFor] = useState<AdminChannel | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm" style={{ color: 'var(--text)' }}>
          {channels.data ? `${channels.data.length} channels` : 'Loading…'}
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
          <span className="relative">+ New channel</span>
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
              <Th>Slug</Th>
              <Th>Name</Th>
              <Th>Kind</Th>
              <Th>Created</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {channels.data?.map((c, i) => (
              <tr
                key={c.id}
                style={{
                  borderBottom:
                    i === (channels.data!.length - 1) ? 'none' : '1px solid var(--border-soft)',
                  opacity: c.archived_at ? 0.55 : 1,
                }}
              >
                <Td>
                  <span className="font-mono">
                    <span style={{ color: 'var(--accent-text)' }}>#</span>
                    {c.slug}
                  </span>
                </Td>
                <Td>{c.name}</Td>
                <Td>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{ color: 'var(--text)' }}
                  >
                    {c.kind}
                  </span>
                </Td>
                <Td>
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                    {formatTimestamp(c.created_at)}
                  </span>
                </Td>
                <Td>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{
                      color: c.archived_at ? 'var(--muted)' : 'var(--success)',
                    }}
                  >
                    {c.archived_at ? 'archived' : 'active'}
                  </span>
                </Td>
                <Td align="right">
                  <RowAction onClick={() => setMemberFor(c)}>Members</RowAction>
                  <span className="mx-2" style={{ color: 'var(--border)' }}>|</span>
                  {c.archived_at ? (
                    <RowAction onClick={() => unarchive.mutate(c.id)}>Unarchive</RowAction>
                  ) : (
                    <RowAction onClick={() => archive.mutate(c.id)}>Archive</RowAction>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {channels.data && channels.data.length === 0 && (
          <div className="px-6 py-12 text-center" style={{ color: 'var(--muted)' }}>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em]">no channels yet</p>
          </div>
        )}
      </div>

      <CreateChannelModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <AddMemberModal
        channel={memberFor}
        onClose={() => setMemberFor(null)}
      />
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

function CreateChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'public' | 'private' | 'dm'>('public')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateChannel()

  function reset() {
    setSlug('')
    setName('')
    setDescription('')
    setKind('public')
    setError(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function submit() {
    setError(null)
    try {
      await create.mutateAsync({ slug, name, description: description || null, kind })
      close()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed')
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New channel"
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
            disabled={create.isPending || !slug || !name}
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
        <Field label="Slug (lowercase)">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full bg-transparent px-3 py-2 text-sm font-mono"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
        </Field>
        <Field label="Display name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent px-3 py-2 text-sm"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none bg-transparent px-3 py-2 text-sm"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
        </Field>
        <Field label="Visibility">
          <div className="flex gap-2">
            {(['public', 'private', 'dm'] as const).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className="font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-1.5"
                style={{
                  background: kind === k ? 'var(--accent-soft)' : 'transparent',
                  color: kind === k ? 'var(--accent-text-bold)' : 'var(--muted)',
                  border: '1px solid',
                  borderColor: kind === k ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 'var(--radius-btn)',
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </Field>
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

function AddMemberModal({
  channel,
  onClose,
}: {
  channel: AdminChannel | null
  onClose: () => void
}) {
  const accounts = useAdminAccounts()
  const add = useAddMembership()
  const [accountHandle, setAccountHandle] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'read_only'>('member')
  const [error, setError] = useState<string | null>(null)

  if (!channel) return null

  async function submit() {
    if (!channel) return
    setError(null)
    try {
      await add.mutateAsync({
        channel_slug: channel.slug,
        account_handle: accountHandle,
        role,
      })
      setAccountHandle('')
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed')
    }
  }

  return (
    <Modal
      open={!!channel}
      onClose={onClose}
      width="md"
      title={`Members of #${channel.slug}`}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--muted)' }}
        >
          Done
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text)' }}>
          Add a member by handle. Existing members aren't listed here in v1
          (the channel-members endpoint is wired into the chat composer's
          autocomplete; full membership management UI lands in phase 2).
        </p>
        <Field label="Account handle">
          <input
            type="text"
            value={accountHandle}
            onChange={(e) => setAccountHandle(e.target.value)}
            list="all-accounts"
            placeholder="e.g. mira"
            className="w-full bg-transparent px-3 py-2 text-sm font-mono"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text-strong)',
            }}
          />
          <datalist id="all-accounts">
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.handle} />
            ))}
          </datalist>
        </Field>
        <Field label="Role">
          <div className="flex gap-2">
            {(['admin', 'member', 'read_only'] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className="font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-1.5"
                style={{
                  background: role === r ? 'var(--accent-soft)' : 'transparent',
                  color: role === r ? 'var(--accent-text-bold)' : 'var(--muted)',
                  border: '1px solid',
                  borderColor: role === r ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 'var(--radius-btn)',
                }}
              >
                {r.replace('_', '-')}
              </button>
            ))}
          </div>
        </Field>
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
          type="button"
          onClick={submit}
          disabled={!accountHandle || add.isPending}
          className="px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] disabled:opacity-50"
          style={{
            background: 'var(--accent)',
            color: 'var(--ink-900)',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          {add.isPending ? 'Adding…' : 'Add member'}
        </button>
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
