import { describe, expect, it } from 'vitest'
import { sendNotices } from './send-notices'

const limits = { maxRunsPerDay: 1, maxRounds: 3, anonymous: true, signedInMaxRunsPerDay: 3 }

describe('sendNotices quota_exceeded', () => {
  it('upsells sign-in to anonymous users', () => {
    expect(sendNotices(limits).quota_exceeded).toBe(
      "You've used today's free run. Sign in for 3 runs a day, or come back tomorrow.",
    )
  })

  it('keeps the registered wording', () => {
    expect(sendNotices({ ...limits, maxRunsPerDay: 3, anonymous: false }).quota_exceeded).toBe(
      "You've used today's 3 runs. Come back tomorrow.",
    )
    expect(sendNotices({ ...limits, maxRunsPerDay: 2, anonymous: false }).quota_exceeded).toBe(
      "You've used today's two runs. Come back tomorrow.",
    )
  })
})
