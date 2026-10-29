import { describe, expect, it } from 'vitest'
import { allowCheck } from './rate-limit'

describe('allowCheck', () => {
  it('allows 20 checks per user per rolling hour', () => {
    const start = 1_000_000
    for (let i = 0; i < 20; i++) expect(allowCheck('u1', start + i)).toBe(true)
    expect(allowCheck('u1', start + 20)).toBe(false)
    expect(allowCheck('u2', start + 20)).toBe(true)
    expect(allowCheck('u1', start + 60 * 60 * 1000)).toBe(true)
  })
})
