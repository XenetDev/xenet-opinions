export const PLANS = {
  guest: { name: 'Guest', runs: 1, maxRounds: 3, maxParticipants: 10, period: 'lifetime', priceUsd: 0 },
  free: { name: 'Free', runs: 1, maxRounds: 3, maxParticipants: 10, period: 'month', priceUsd: 0 },
  starter: {
    name: 'Starter',
    runs: 2,
    maxRounds: 5,
    maxParticipants: 25,
    period: 'billing',
    priceUsd: 10,
    lookupKey: 'starter_monthly',
  },
  pro: {
    name: 'Pro',
    runs: 2,
    maxRounds: 10,
    maxParticipants: 50,
    period: 'billing',
    priceUsd: 20,
    lookupKey: 'pro_monthly',
  },
} as const

export type PlanId = keyof typeof PLANS
export type PaidPlanId = 'starter' | 'pro'

export const isPaidPlan = (value: unknown): value is PaidPlanId => value === 'starter' || value === 'pro'

export const planFromLookupKey = (key: string | null | undefined): PaidPlanId | null =>
  key === PLANS.starter.lookupKey ? 'starter' : key === PLANS.pro.lookupKey ? 'pro' : null

export const startOfUtcMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

export const startOfNextUtcMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
