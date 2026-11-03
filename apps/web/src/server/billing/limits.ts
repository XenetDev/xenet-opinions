import { PLANS, type PlanId } from '@xo/engine/policy'
import { getLimits, type Limits } from '@/server/limits'
import type { Allowance } from './allowance'
import { billingEnabled } from './stripe'

export type ResolvedLimits = { limits: Limits; allowance: Allowance | null }

export async function resolveLimits(user: { id: string; isAnonymous: boolean } | null): Promise<ResolvedLimits> {
  const base = getLimits(user ?? { isAnonymous: true })
  if (!billingEnabled()) return { limits: base, allowance: null }
  const { getAllowance, guestAllowance } = await import('./allowance')
  const allowance = user ? await getAllowance(user) : guestAllowance()
  return {
    allowance,
    limits: {
      ...base,
      demoMode: true,
      maxRunsPerDay: allowance.max,
      signedInMaxRunsPerDay: PLANS.free.runs,
      maxRounds: allowance.maxRounds,
      plan: allowance.plan satisfies PlanId,
      resetAt: allowance.resetAt,
    },
  }
}
