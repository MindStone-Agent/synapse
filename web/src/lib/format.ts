/* Small formatting helpers for the channel view. */

/**
 * Parse an API timestamp into a Date.
 *
 * The API emits naive-UTC ISO strings (SQLite drops tzinfo on read-back),
 * e.g. "2026-06-03T16:07:19.369827" with no offset. JS interprets a
 * timezone-less datetime as LOCAL time, so a UTC value would never get
 * converted and would render as UTC. Treat a missing timezone as UTC
 * (append 'Z') so the instant is correct and `toLocale*` renders it in the
 * viewer's local zone.
 */
export function parseTimestamp(iso: string): Date {
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
  return new Date(hasTz ? iso : `${iso}Z`)
}

/** Returns "h:mm" or "Mon, h:mm" or "Jun 4, h:mm" depending on age. */
export function formatTimestamp(iso: string, now: Date = new Date()): string {
  const d = parseTimestamp(iso)
  if (Number.isNaN(d.getTime())) return iso

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (sameDay) return time

  const sevenDays = 1000 * 60 * 60 * 24 * 7
  if (now.getTime() - d.getTime() < sevenDays) {
    const wd = d.toLocaleDateString(undefined, { weekday: 'short' })
    return `${wd}, ${time}`
  }

  const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${md}, ${time}`
}

/** Returns true if two messages should be grouped (same sender, < 5 minutes apart). */
export function shouldGroup(prev: { sender_handle: string; created_at: string }, curr: { sender_handle: string; created_at: string }) {
  if (prev.sender_handle !== curr.sender_handle) return false
  const dt = parseTimestamp(curr.created_at).getTime() - parseTimestamp(prev.created_at).getTime()
  return dt < 5 * 60 * 1000
}
