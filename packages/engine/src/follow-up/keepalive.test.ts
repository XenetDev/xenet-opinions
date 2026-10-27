import { describe, expect, it } from 'vitest'
import {
  CLOSE_WAIT_DEADLINE_MS,
  ENV_CHECK_INTERVAL_MS,
  ENV_INTERVIEW_EXTEND_MS,
  ENV_KEEPALIVE_CAP_MS,
  extendInterviewWindow,
  extendKeepalive,
  INTERVIEW_CLIENT_TIMEOUT_MS,
  INTERVIEW_EXTEND_PER_PERSONA_MS,
  INTERVIEW_MIROFISH_TIMEOUT_S,
  INTERVIEW_WINDOW_CAP_MS,
  INTERVIEW_WINDOW_MS,
} from './keepalive'

const MIN = 60_000
const t0 = new Date('2026-01-01T00:00:00Z')
const at = (min: number) => new Date(t0.getTime() + min * MIN)

describe('keepalive', () => {
  it('uses the documented constants', () => {
    expect(ENV_INTERVIEW_EXTEND_MS).toBe(10 * MIN)
    expect(ENV_KEEPALIVE_CAP_MS).toBe(60 * MIN)
    expect(INTERVIEW_WINDOW_MS).toBe(20 * MIN)
    expect(INTERVIEW_EXTEND_PER_PERSONA_MS).toBe(5 * MIN)
    expect(INTERVIEW_WINDOW_CAP_MS).toBe(60 * MIN)
    expect(ENV_CHECK_INTERVAL_MS).toBe(30_000)
    expect(CLOSE_WAIT_DEADLINE_MS).toBe(3 * MIN)
    expect(INTERVIEW_MIROFISH_TIMEOUT_S).toBe(240)
    expect(INTERVIEW_CLIENT_TIMEOUT_MS).toBe(270_000)
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
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(120) }, at(1))).toEqual(at(120))
  })

  it('keeps a current deadline at the cap unchanged', () => {
    expect(extendKeepalive({ finishedAt: t0, envKeepaliveUntil: at(60) }, at(30))).toEqual(at(60))
  })

  it('caps relative to now when never finished', () => {
    expect(extendKeepalive({ finishedAt: null, envKeepaliveUntil: null }, at(5))).toEqual(at(15))
  })

  it('five extensions never exceed the cap', () => {
    let current: Date | null = at(20)
    for (let i = 0; i < 5; i++) {
      current = extendKeepalive({ finishedAt: t0, envKeepaliveUntil: current }, at(10 + i))
      expect(current.getTime()).toBeLessThanOrEqual(at(60).getTime())
    }
    expect(current).toEqual(at(60))
  })
})

describe('extendInterviewWindow', () => {
  const started = { interviewsStartedAt: t0.toISOString() }

  it('adds five minutes per persona to the current deadline', () => {
    expect(extendInterviewWindow({ envKeepaliveUntil: at(20), cursors: started }, 2, at(5))).toEqual(at(30))
  })

  it('extends from now when the deadline has passed or is missing', () => {
    expect(extendInterviewWindow({ envKeepaliveUntil: at(20), cursors: started }, 1, at(25))).toEqual(at(30))
    expect(extendInterviewWindow({ envKeepaliveUntil: null, cursors: started }, 1, at(25))).toEqual(at(30))
  })

  it('caps at 60 minutes after the pause started', () => {
    expect(extendInterviewWindow({ envKeepaliveUntil: at(50), cursors: started }, 5, at(40))).toEqual(at(60))
  })

  it('never shortens a deadline already past the cap', () => {
    expect(extendInterviewWindow({ envKeepaliveUntil: at(70), cursors: started }, 1, at(10))).toEqual(at(70))
  })

  it('caps relative to now when the pause start is unknown', () => {
    expect(extendInterviewWindow({ envKeepaliveUntil: null, cursors: {} }, 1, at(5))).toEqual(at(10))
  })
})
