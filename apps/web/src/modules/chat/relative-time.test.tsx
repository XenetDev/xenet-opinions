import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

describe('relativeTime', () => {
  const now = new Date(2026, 9, 28, 15, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it.each([
    [ago(20_000), 'just now'],
    [ago(5 * 60_000), '5 min'],
    [ago(3 * 3_600_000), '3 h'],
    [new Date(2026, 9, 27, 9, 0).toISOString(), 'Yesterday'],
    [
      new Date(2026, 9, 25, 9, 0).toISOString(),
      new Date(2026, 9, 25).toLocaleDateString(undefined, { weekday: 'long' }),
    ],
    [
      new Date(2026, 8, 2, 9, 0).toISOString(),
      new Date(2026, 8, 2).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    ],
  ])('formats %s as %s', (iso, label) => {
    expect(relativeTime(iso, now)).toBe(label)
  })

  it('says Yesterday for a time past midnight even when under 24 hours', () => {
    expect(relativeTime(new Date(2026, 9, 27, 23, 0).toISOString(), new Date(2026, 9, 28, 1, 0))).toBe('Yesterday')
  })
})
