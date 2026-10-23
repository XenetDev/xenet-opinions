import { describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: {} }))

import { limitsFromEnv } from './limits'

const base = { DEMO_MODE: '0', DEMO_PAUSED: '0', MAX_RUNS_PER_DAY: 2, DEMO_MAX_ROUNDS: 3 } as const

describe('limitsFromEnv', () => {
  it('leaves rounds at 40 outside demo mode', () => {
    expect(limitsFromEnv(base)).toEqual({ demoMode: false, paused: false, maxRunsPerDay: 2, maxRounds: 40 })
  })

  it('applies the demo cap and pause flag', () => {
    expect(limitsFromEnv({ ...base, DEMO_MODE: '1', DEMO_PAUSED: '1', DEMO_MAX_ROUNDS: 5 })).toEqual({
      demoMode: true,
      paused: true,
      maxRunsPerDay: 2,
      maxRounds: 5,
    })
  })
})
