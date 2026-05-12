import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useChannelStream, type StreamEvent, type StreamStatus } from './realtime'

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

// Safety-net poll. Real-time arrives via WebSocket; this catches any
// fan-out we missed during a brief disconnect or hub overflow.
const POLL_INTERVAL_MS = 30_000

/**
 * Channel messages — initial fetch + safety-net poll.
 *
 * Real-time updates come via `useChannelLiveSync` which subscribes to
 * /v1/ws and pushes new messages into this cache. Polling is fallback
 * only.
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

/**
 * Open a WebSocket for `slug` and push new messages into the
 * `['messages', slug]` query cache. Returns the connection status so
 * the UI can show a "reconnecting…" indicator if needed.
 *
 * On reconnect we invalidate the query — that re-fetches the recent 50
 * and recovers anything missed while the socket was down.
 */
export function useChannelLiveSync(slug: string): StreamStatus {
  const qc = useQueryClient()
  const queryKey = ['messages', slug]

  const onEvent = useCallback(
    (event: StreamEvent) => {
      if (event.type === 'hello') {
        // Re-sync history on (re)connect to backfill anything missed.
        qc.invalidateQueries({ queryKey })
        return
      }
      if (event.type === 'message.created') {
        qc.setQueryData<Message[] | undefined>(queryKey, (prev) => {
          const incoming = event.message
          if (!prev) return [incoming]
          // Dedup: the POST response also invalidates this key, so the
          // newly-posted message can arrive both ways.
          if (prev.some((m) => m.id === incoming.id)) return prev
          const next = [...prev, incoming]
          next.sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          )
          return next
        })
      }
    },
    // queryKey is structurally equal across renders for a given slug;
    // pull `slug` directly into deps to satisfy exhaustive-deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, qc],
  )

  return useChannelStream(slug, { onEvent })
}

export function useChannelMembers(slug: string) {
  return useQuery({
    queryKey: ['channels', slug, 'members'],
    queryFn: () => api<{ members: Member[] }>(`/v1/channels/${slug}/members`),
    staleTime: 60_000,
  })
}

export interface ChannelSummary {
  id: string
  slug: string
  name: string
  description: string | null
  kind: string
  role: 'admin' | 'member' | 'read_only'
}

/** Channels the current user is a member of (sidebar source-of-truth). */
export function useMyChannels() {
  return useQuery({
    queryKey: ['channels', 'mine'],
    queryFn: () => api<{ channels: ChannelSummary[] }>('/v1/channels'),
    staleTime: 30_000,
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
