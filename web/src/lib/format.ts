/* Small formatting helpers for the channel view. */

/** Returns "h:mm" or "Mon, h:mm" or "Jun 4, h:mm" depending on age. */
export function formatTimestamp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
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
  const dt = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
  return dt < 5 * 60 * 1000
}
