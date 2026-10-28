import { QUOTA_WINDOW_MS } from '@xo/engine'

export type Usage = { used: number; max: number; resetAt: string | null }

export function usageFrom(
  window: { count: number; oldestQueuedAt: Date | null },
  limits: { demoMode: boolean; maxRunsPerDay: number },
): Usage | null {
  if (!limits.demoMode) return null
  const resetAt = window.oldestQueuedAt ? new Date(window.oldestQueuedAt.getTime() + QUOTA_WINDOW_MS) : null
  return {
    used: Math.min(window.count, limits.maxRunsPerDay),
    max: limits.maxRunsPerDay,
    resetAt: resetAt?.toISOString() ?? null,
  }
}
