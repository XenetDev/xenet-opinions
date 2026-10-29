const WINDOW_MS = 60 * 60 * 1000
const MAX_CHECKS = 20

const checks = new Map<string, number[]>()

export function allowCheck(userId: string, now = Date.now()): boolean {
  const recent = (checks.get(userId) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= MAX_CHECKS) {
    checks.set(userId, recent)
    return false
  }
  recent.push(now)
  checks.set(userId, recent)
  return true
}
