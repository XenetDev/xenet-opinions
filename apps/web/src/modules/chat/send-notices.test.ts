import { describe, expect, it } from 'vitest'
import { sendNotices } from './send-notices'

const limits = { maxRunsPerDay: 1, maxRounds: 3, anonymous: true, signedInMaxRunsPerDay: 3 }

describe('sendNotices quota_exceeded', () => {
  it('upsells sign-in to anonymous users', () => {
    expect(sendNotices(limits, true).quota_exceeded).toBe(
      "You've used today's free run. Sign in for 3 runs a day, or come back tomorrow.",
    )
  })

  it('counts several anonymous runs', () => {
    expect(sendNotices({ ...limits, maxRunsPerDay: 2 }, true).quota_exceeded).toBe(
      "You've used today's 2 free runs. Sign in for 3 runs a day, or come back tomorrow.",
    )
  })

  it('uses the registered wording for anonymous users when sign-in is unavailable', () => {
    expect(sendNotices(limits, false).quota_exceeded).toBe("You've used today's run. Come back tomorrow.")
    expect(sendNotices({ ...limits, maxRunsPerDay: 2 }, false).quota_exceeded).toBe(
      "You've used today's two runs. Come back tomorrow.",
    )
  })

  it('keeps the registered wording', () => {
    expect(sendNotices({ ...limits, maxRunsPerDay: 3, anonymous: false }, true).quota_exceeded).toBe(
      "You've used today's 3 runs. Come back tomorrow.",
    )
    expect(sendNotices({ ...limits, maxRunsPerDay: 2, anonymous: false }, true).quota_exceeded).toBe(
      "You've used today's two runs. Come back tomorrow.",
    )
  })
})

describe('sendNotices files_required', () => {
  it('is gone now that runs start from a prompt alone', () => {
    expect(sendNotices(limits, true)).not.toHaveProperty('files_required')
  })
})
