import { describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: {} }))

import { limitsFromEnv } from './limits'

const registered = { isAnonymous: false }
const anonymous = { isAnonymous: true }

const base = {
  DEMO_MODE: '0',
  DEMO_PAUSED: '0',
  DEMO_ALLOW_PAUSE: '1',
  MAX_RUNS_PER_DAY: 3,
  MAX_RUNS_PER_DAY_ANONYMOUS: 1,
  DEMO_MAX_ROUNDS: 3,
} as const

describe('limitsFromEnv', () => {
  it('leaves rounds at 40 outside demo mode', () => {
    expect(limitsFromEnv(base, registered)).toEqual({
      demoMode: false,
      paused: false,
      maxRunsPerDay: 3,
      signedInMaxRunsPerDay: 3,
      anonymous: false,
      maxRounds: 40,
      allowPause: true,
    })
  })

  it('applies the demo cap and pause flag', () => {
    expect(limitsFromEnv({ ...base, DEMO_MODE: '1', DEMO_PAUSED: '1', DEMO_MAX_ROUNDS: 5 }, registered)).toEqual({
      demoMode: true,
      paused: true,
      maxRunsPerDay: 3,
      signedInMaxRunsPerDay: 3,
      anonymous: false,
      maxRounds: 5,
      allowPause: true,
    })
  })

  it('disallows pausing when DEMO_ALLOW_PAUSE is 0', () => {
    expect(limitsFromEnv({ ...base, DEMO_ALLOW_PAUSE: '0' }, registered).allowPause).toBe(false)
  })

  it('gives anonymous users the anonymous quota and flags them', () => {
    expect(limitsFromEnv(base, anonymous)).toMatchObject({
      maxRunsPerDay: 1,
      signedInMaxRunsPerDay: 3,
      anonymous: true,
    })
  })
})
