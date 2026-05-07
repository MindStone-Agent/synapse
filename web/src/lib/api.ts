/* Thin fetch wrapper. All API responses are JSON. Cookies (the
 * synapse_session cookie set by /v1/auth/login) ride on credentials:
 * 'include' for same-origin same-domain dev + prod through Caddy. */

export class ApiError extends Error {
  status: number
  payload: unknown
  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    credentials: 'include',
    signal: opts.signal,
    headers: {
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
  }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)

  const res = await fetch(path, init)

  // 204 / no-content
  if (res.status === 204) return undefined as T

  const text = await res.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!res.ok) {
    const detail =
      typeof payload === 'object' && payload !== null && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : res.statusText
    throw new ApiError(res.status, detail, payload)
  }

  return payload as T
}
