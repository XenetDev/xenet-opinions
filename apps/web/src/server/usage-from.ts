import { QUOTA_WINDOW_MS } from '@xo/engine'
import type { PlanId } from '@xo/engine/policy'
import type { Allowance } from './billing/allowance'

export type Usage = {
  used: number
  max: number
  resetAt: string | null
  plan?: PlanId
  subscribed?: boolean
  cancelAtPeriodEnd?: boolean
}

export const usageFromAllowance = (allowance: Allowance): Usage => ({
  used: Math.min(allowance.used, allowance.max),
  max: allowance.max,
  resetAt: allowance.resetAt,
  plan: allowance.plan,
  subscribed: allowance.subscribed,
  cancelAtPeriodEnd: allowance.cancelAtPeriodEnd,
})

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
