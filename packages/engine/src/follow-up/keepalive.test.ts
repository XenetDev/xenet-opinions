import { describe, expect, it } from 'vitest'
import { ENV_INTERVIEW_EXTEND_MS, ENV_KEEPALIVE_CAP_MS, ENV_KEEPALIVE_MS, extendKeepalive, keepaliveAfterFinish } from './keepalive'

const MIN = 60_000
const t0 = new Date('2026-01-01T00:00:00Z')
const at = (min: number) => new Date(t0.getTime() + min * MIN)

describe('keepalive', () => {
  it('uses the documented constants', () => {
    expect(ENV_KEEPALIVE_MS).toBe(20 * MIN)
    expect(ENV_INTERVIEW_EXTEND_MS).toBe(10 * MIN)
    expect(ENV_KEEPALIVE_CAP_MS).toBe(60 * MIN)
  })

  it('keeps the env alive 20 minutes after finish', () => {
    expect(keepaliveAfterFinish(t0)).toEqual(at(20))
    expect(keepaliveAfterFinish(t0, 5 * MIN)).toEqual(at(5))
  })

  it('extends from now when the current keepalive is in the past', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(20) }, at(30))).toEqual(at(40))
  })

  it('extends from the current keepalive when it is in the future', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(20) }, at(10))).toEqual(at(30))
  })

  it('extends from now when there is no current keepalive', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: null }, at(5))).toEqual(at(15))
  })

  it('caps at 60 minutes after finish', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(55) }, at(50))).toEqual(at(60))
  })

  it('never shortens a current deadline that is already beyond the cap', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(120) }, at(10))).toEqual(at(120))
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: keepaliveAfterFinish(t0, 120 * MIN) }, at(1))).toEqual(at(120))
  })

  it('keeps a current deadline at the cap unchanged', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(60) }, at(30))).toEqual(at(60))
  })

  it('caps relative to now when never finished', () => {
    expect(extendKeepalive({ finishedAt: null, envKeepaliveUntil: null }, at(5))).toEqual(at(15))
  })

  it('five extensions never exceed the cap', () => {
    let current: Date | null = keepaliveAfterFinish(t0)
    for (let i = 0; i < 5; i++) {
      current = extendKeepalive({ finishedAt: t0, envKeepaliveUntil: current }, at(10 + i))
      expect(current.getTime()).toBeLessThanOrEqual(at(60).getTime())
    }
    expect(current).toEqual(at(60))
  })
})
