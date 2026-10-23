import { describe, expect, it } from 'vitest'
import { checkRunPolicy, DEMO_MAX_ROUNDS, MAX_RUNS_PER_DAY, QUOTA_WINDOW_MS } from './quota'

const windowStartedAt = new Date('2026-01-01T00:00:00Z')
const base = { demoMode: true, paused: false, runsInWindow: 0, maxRunsPerDay: 2, requestedRounds: 3, maxRounds: 3, windowStartedAt }

describe('checkRunPolicy', () => {
  it('uses the documented constants', () => {
    expect(MAX_RUNS_PER_DAY).toBe(2)
    expect(DEMO_MAX_ROUNDS).toBe(3)
    expect(QUOTA_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('allows a run within limits', () => {
    expect(checkRunPolicy({ ...base, runsInWindow: 1 })).toEqual({ ok: true })
  })

  it('pause wins over quota and rounds', () => {
    expect(checkRunPolicy({ ...base, paused: true, runsInWindow: 5, requestedRounds: 40 })).toEqual({ ok: false, code: 'demo_paused' })
  })

  it('rejects when the quota is used up and reports the reset time', () => {
    expect(checkRunPolicy({ ...base, runsInWindow: 2, requestedRounds: 40 })).toEqual({
      ok: false,
      code: 'quota_exceeded',
      resetAt: new Date(windowStartedAt.getTime() + QUOTA_WINDOW_MS),
      max: 2,
    })
  })

  it('rejects too many rounds and reports the max', () => {
    expect(checkRunPolicy({ ...base, requestedRounds: 4 })).toEqual({ ok: false, code: 'rounds_exceeded', max: 3 })
  })

  it('only applies the pause when demo mode is off', () => {
    expect(checkRunPolicy({ ...base, demoMode: false, runsInWindow: 10, requestedRounds: 40 })).toEqual({ ok: true })
    expect(checkRunPolicy({ ...base, demoMode: false, paused: true })).toEqual({ ok: false, code: 'demo_paused' })
  })
})
