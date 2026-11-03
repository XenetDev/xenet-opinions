import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('./sync', () => ({
  isPaidStatus: (status: string | null) => status === 'active' || status === 'trialing' || status === 'past_due',
  syncSubscription: vi.fn(),
}))

import { resolvePlan } from './allowance'

const now = new Date('2026-11-15T12:00:00Z')
const member = { isAnonymous: false }
const paid = {
  plan: 'starter',
  status: 'active',
  currentPeriodStart: new Date('2026-11-03T00:00:00Z'),
  currentPeriodEnd: new Date('2026-12-03T00:00:00Z'),
  cancelAtPeriodEnd: false,
}

describe('resolvePlan', () => {
  it('counts a guest for the lifetime of the account', () => {
    expect(resolvePlan({ isAnonymous: true }, undefined, now)).toMatchObject({
      plan: 'guest',
      since: null,
      resetAt: null,
    })
  })

  it('gives a signed-in user with no subscription the UTC calendar month', () => {
    const resolved = resolvePlan(member, undefined, now)
    expect(resolved.plan).toBe('free')
    expect(resolved.since?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(resolved.resetAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it.each(['active', 'trialing', 'past_due'])('keeps the paid plan and billing period while %s', (status) => {
    expect(resolvePlan(member, { ...paid, status }, now)).toMatchObject({
      plan: 'starter',
      since: paid.currentPeriodStart,
      resetAt: paid.currentPeriodEnd,
      subscribed: true,
    })
  })

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])(
    'falls back to Free when %s',
    (status) => {
      expect(resolvePlan(member, { ...paid, status }, now)).toMatchObject({ plan: 'free', subscribed: false })
    },
  )

  it('falls back to Free for a row with a customer but no subscription yet', () => {
    const row = { plan: null, status: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
    expect(resolvePlan(member, row, now).plan).toBe('free')
  })

  it('reports a pending cancellation', () => {
    expect(resolvePlan(member, { ...paid, cancelAtPeriodEnd: true }, now).cancelAtPeriodEnd).toBe(true)
  })
})
