import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveLimits = vi.hoisted(() => vi.fn())
vi.mock('@/server/billing/limits', () => ({ resolveLimits }))
vi.mock('@/server/billing/stripe', () => ({ billingEnabled: () => true }))
vi.mock('@/server/limits', () => ({ getLimits: vi.fn() }))
const runsStartedSince = vi.hoisted(() => vi.fn())
vi.mock('@/server/runs', () => ({ runsStartedSince }))

import { checkRunGate } from './run-gate'

const user = { id: 'u', isAnonymous: false, email: '', name: '', image: null }
const plan = (used: number, paused = false) => ({
  limits: { paused, maxRounds: 5 },
  allowance: { used, max: 4, resetAt: '2026-12-03T00:00:00.000Z' },
})

beforeEach(() => resolveLimits.mockReset())
afterEach(() => vi.clearAllMocks())

describe('checkRunGate with plans', () => {
  it('allows a run with allowance left and ignores the daily window', async () => {
    resolveLimits.mockResolvedValue(plan(3))
    expect((await checkRunGate(user, { requestedRounds: 5 })).ok).toBe(true)
    expect(runsStartedSince).not.toHaveBeenCalled()
  })

  it('refuses at the allowance with the reset date', async () => {
    resolveLimits.mockResolvedValue(plan(4))
    const gate = await checkRunGate(user)
    if (gate.ok) throw new Error('expected refusal')
    expect(gate.response.status).toBe(429)
    expect(await gate.response.json()).toEqual({ error: 'quota_exceeded', resetAt: '2026-12-03T00:00:00.000Z' })
  })

  it('lets retries through with no allowance left', async () => {
    resolveLimits.mockResolvedValue(plan(4))
    expect((await checkRunGate(user, { spendsQuota: false })).ok).toBe(true)
  })

  it('refuses rounds above the plan', async () => {
    resolveLimits.mockResolvedValue(plan(0))
    const gate = await checkRunGate(user, { requestedRounds: 6 })
    if (gate.ok) throw new Error('expected refusal')
    expect(gate.response.status).toBe(400)
    expect(await gate.response.json()).toEqual({ error: 'rounds_exceeded', max: 5 })
  })

  it('stays closed while paused, even for retries', async () => {
    resolveLimits.mockResolvedValue(plan(0, true))
    const gate = await checkRunGate(user, { spendsQuota: false })
    if (gate.ok) throw new Error('expected refusal')
    expect(gate.response.status).toBe(409)
  })
})
