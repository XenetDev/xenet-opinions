import { describe, expect, it } from 'vitest'
import { usageFrom } from './usage-from'

describe('usageFrom', () => {
  it('is null outside demo mode', () => {
    expect(usageFrom({ count: 1, oldestQueuedAt: new Date() }, { demoMode: false, maxRunsPerDay: 2 })).toBeNull()
  })
  it('reports used, max and the reset time 24 h after the oldest run', () => {
    const oldest = new Date('2026-10-28T08:00:00Z')
    expect(usageFrom({ count: 1, oldestQueuedAt: oldest }, { demoMode: true, maxRunsPerDay: 10 })).toEqual({
      used: 1,
      max: 10,
      resetAt: '2026-10-29T08:00:00.000Z',
    })
  })
  it('caps used at max and has no reset time with no runs', () => {
    expect(usageFrom({ count: 5, oldestQueuedAt: null }, { demoMode: true, maxRunsPerDay: 2 })).toEqual({
      used: 2,
      max: 2,
      resetAt: null,
    })
  })
})
