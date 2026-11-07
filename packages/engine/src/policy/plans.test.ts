import { describe, expect, it } from 'vitest'
import { isPaidPlan, PLANS, planFromLookupKey, startOfNextUtcMonth, startOfUtcMonth } from './plans'

describe('plans', () => {
  it('holds the approved allowances', () => {
    expect(PLANS.guest).toMatchObject({ runs: 1, maxRounds: 3, maxParticipants: 10, period: 'lifetime' })
    expect(PLANS.free).toMatchObject({ runs: 1, maxRounds: 3, maxParticipants: 10, period: 'month' })
    expect(PLANS.starter).toMatchObject({ runs: 2, maxRounds: 5, maxParticipants: 25, period: 'billing', priceUsd: 10 })
    expect(PLANS.pro).toMatchObject({ runs: 2, maxRounds: 10, maxParticipants: 50, period: 'billing', priceUsd: 20 })
  })

  it('maps lookup keys to paid plans only', () => {
    expect(planFromLookupKey('starter_monthly')).toBe('starter')
    expect(planFromLookupKey('pro_monthly')).toBe('pro')
    expect(planFromLookupKey('other')).toBeNull()
    expect(planFromLookupKey(null)).toBeNull()
    expect(isPaidPlan('free')).toBe(false)
  })

  it('computes UTC month boundaries, across a year end', () => {
    const now = new Date('2026-12-31T23:59:59Z')
    expect(startOfUtcMonth(now).toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(startOfNextUtcMonth(now).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
