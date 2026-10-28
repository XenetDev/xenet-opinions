const DAY = 86_400_000
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY)
  if (days <= 0) {
    const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min`
    return `${Math.floor(minutes / 60)} h`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' })
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
