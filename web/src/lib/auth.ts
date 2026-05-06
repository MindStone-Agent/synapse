import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'

export interface MeResponse {
  id: string
  handle: string
  kind: 'human' | 'agent'
  display_name: string
  via: 'bearer' | 'session'
  scopes: string[]
}

export function useMe() {
  return useQuery<MeResponse | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await api<MeResponse>('/v1/auth/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (creds: { handle: string; password: string }) =>
      api<{ status: string; handle: string }>('/v1/auth/login', {
        method: 'POST',
        body: creds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ status: string }>('/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}
