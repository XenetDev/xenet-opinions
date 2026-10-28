import { describe, expect, it } from 'vitest'
import { NIGHT_ROUNDS, requestedRounds, visibleRound } from './rounds'

describe('rounds', () => {
  it('asks MiroFish for the night rounds on top of the requested ones', () => {
    expect(requestedRounds(3)).toBe(3 + NIGHT_ROUNDS)
  })

  it('hides the night rounds and clamps to the requested count', () => {
    expect(visibleRound(undefined, 3)).toBeUndefined()
    expect(visibleRound(0, 3)).toBe(0)
    expect(visibleRound(NIGHT_ROUNDS, 3)).toBe(0)
    expect(visibleRound(NIGHT_ROUNDS + 2, 3)).toBe(2)
    expect(visibleRound(NIGHT_ROUNDS + 3, 3)).toBe(3)
    expect(visibleRound(NIGHT_ROUNDS + 9, 3)).toBe(3)
  })
})
