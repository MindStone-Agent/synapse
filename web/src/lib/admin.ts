import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export interface AdminAccount {
  id: string
  handle: string
  kind: 'human' | 'agent'
  display_name: string
  email: string | null
  created_at: string
  archived_at: string | null
}

export interface AdminChannel {
  id: string
  slug: string
  name: string
  description: string | null
  kind: 'public' | 'private' | 'dm'
  created_at: string
  archived_at: string | null
}

export interface AdminToken {
  id: string
  account_handle: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface IssuedToken extends AdminToken {
  token: string // raw, only on create
}

const KEY = {
  accounts: ['admin', 'accounts'] as const,
  channels: ['admin', 'channels'] as const,
  tokens: (handle: string) => ['admin', 'tokens', handle] as const,
}

// --- Accounts ---

export function useAdminAccounts() {
  return useQuery({
    queryKey: KEY.accounts,
    queryFn: () => api<AdminAccount[]>('/v1/admin/accounts'),
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      kind: 'human' | 'agent'
      handle: string
      display_name?: string
      email?: string | null
      password?: string | null
    }) => api<AdminAccount>('/v1/admin/accounts', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.accounts }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      id: string
      patch: { display_name?: string; email?: string | null; password?: string }
    }) =>
      api<AdminAccount>(`/v1/admin/accounts/${vars.id}`, {
        method: 'PATCH',
        body: vars.patch,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.accounts }),
  })
}

export function useArchiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<AdminAccount>(`/v1/admin/accounts/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.accounts }),
  })
}

export function useUnarchiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<AdminAccount>(`/v1/admin/accounts/${id}/unarchive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.accounts }),
  })
}

// --- Channels ---

export function useAdminChannels() {
  return useQuery({
    queryKey: KEY.channels,
    queryFn: () => api<AdminChannel[]>('/v1/admin/channels'),
  })
}

export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      slug: string
      name: string
      description?: string | null
      kind?: 'public' | 'private' | 'dm'
    }) => api<AdminChannel>('/v1/admin/channels', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.channels }),
  })
}

export function useArchiveChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<AdminChannel>(`/v1/admin/channels/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.channels }),
  })
}

export function useUnarchiveChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<AdminChannel>(`/v1/admin/channels/${id}/unarchive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.channels }),
  })
}

export function useAddMembership() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      account_handle: string
      channel_slug: string
      role?: 'admin' | 'member' | 'read_only'
    }) => api<{ account_handle: string; channel_slug: string; role: string }>('/v1/admin/memberships', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY.channels })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}

// --- Tokens ---

export function useAdminTokens(handle: string | null) {
  return useQuery({
    queryKey: handle ? KEY.tokens(handle) : ['admin', 'tokens', '_none'],
    queryFn: () =>
      api<AdminToken[]>(`/v1/admin/tokens?account=${encodeURIComponent(handle as string)}`),
    enabled: !!handle,
  })
}

export function useIssueToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { account_handle: string; scopes: string[] }) =>
      api<IssuedToken>('/v1/admin/tokens', { method: 'POST', body }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEY.tokens(data.account_handle) })
    },
  })
}

export function useRevokeToken(handle: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<AdminToken>(`/v1/admin/tokens/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.tokens(handle) }),
  })
}
