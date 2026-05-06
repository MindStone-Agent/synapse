import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export interface Message {
  id: string
  channel: string
  thread_id: string | null
  reply_to: string | null
  sender_handle: string
  sender_kind: 'human' | 'agent'
  body: string
  body_format: 'markdown' | 'plaintext'
  created_at: string
  edited_at: string | null
  mentioned_handles: string[]
}

export interface MessagesPage {
  messages: Message[]
  next_cursor: string | null
  head_cursor: string | null
}

export interface Member {
  id: string
  handle: string
  display_name: string
  kind: 'human' | 'agent'
  role: 'admin' | 'member' | 'read_only'
}

const POLL_INTERVAL_MS = 5_000

/**
 * Channel messages — refetches the most-recent 50 every 5s.
 *
 * v1 simplification: family-scale traffic won't exceed 50 in a 5-second
 * window, so we don't need cursor-based delta polling. Phase 2 adds
 * scroll-up-to-load-older + WebSocket push.
 *
 * The API returns DESC order; we sort ASC for display.
 */
export function useChannelMessages(slug: string) {
  return useQuery({
    queryKey: ['messages', slug],
    queryFn: async ({ signal }) => {
      const page = await api<MessagesPage>(
        `/v1/messages?channel=${encodeURIComponent(slug)}&limit=50&order=desc`,
        { signal },
      )
      return [...page.messages].sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      )
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useChannelMembers(slug: string) {
  return useQuery({
    queryKey: ['channels', slug, 'members'],
    queryFn: () => api<{ members: Member[] }>(`/v1/channels/${slug}/members`),
    staleTime: 60_000,
  })
}

export function usePostMessage(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { body: string }) =>
      api<Message>('/v1/messages', {
        method: 'POST',
        body: { channel: slug, body: vars.body, body_format: 'markdown' },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', slug] })
    },
  })
}
