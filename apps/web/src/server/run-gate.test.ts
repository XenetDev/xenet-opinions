import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/limits', () => ({ getLimits: vi.fn() }))
vi.mock('@/server/runs', () => ({ runsStartedSince: vi.fn() }))

import { getLimits } from '@/server/limits'
import { checkRunGate } from '@/server/run-gate'
import { runsStartedSince } from '@/server/runs'
import { sessionUser } from '@/test/session-user'

const limits = (over: Partial<ReturnType<typeof getLimits>> = {}) =>
  vi.mocked(getLimits).mockReturnValue({
    demoMode: true,
    paused: false,
    maxRunsPerDay: 2,
    signedInMaxRunsPerDay: 5,
    anonymous: true,
    maxRounds: 4,
    allowPause: true,
    ...over,
  })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(runsStartedSince).mockResolvedValue({ count: 0, oldestQueuedAt: null })
})

describe('checkRunGate', () => {
  it('passes with the limits and window', async () => {
    limits()
    const gate = await checkRunGate(sessionUser())
    expect(gate).toMatchObject({ ok: true, window: { count: 0 }, limits: { maxRounds: 4 } })
  })

  it('answers demo_paused 409', async () => {
    limits({ paused: true })
    const gate = await checkRunGate(sessionUser())
    if (gate.ok) throw new Error('expected a block')
    expect(gate.response.status).toBe(409)
    expect(await gate.response.json()).toEqual({ error: 'demo_paused' })
  })

  it('answers quota_exceeded 429 with an ISO resetAt', async () => {
    limits()
    const oldest = new Date('2026-01-01T00:00:00Z')
    vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: oldest })
    const gate = await checkRunGate(sessionUser())
    if (gate.ok) throw new Error('expected a block')
    expect(gate.response.status).toBe(429)
    expect(await gate.response.json()).toEqual({ error: 'quota_exceeded', resetAt: '2026-01-02T00:00:00.000Z' })
  })

  it('skips the quota count when the caller does not spend quota', async () => {
    limits()
    const gate = await checkRunGate(sessionUser(), { spendsQuota: false })
    expect(gate.ok).toBe(true)
    expect(runsStartedSince).not.toHaveBeenCalled()
  })

  it('answers rounds_exceeded 400 when rounds are requested', async () => {
    limits()
    const gate = await checkRunGate(sessionUser(), { requestedRounds: 9 })
    if (gate.ok) throw new Error('expected a block')
    expect(gate.response.status).toBe(400)
    expect(await gate.response.json()).toEqual({ error: 'rounds_exceeded', max: 4 })
  })
})
