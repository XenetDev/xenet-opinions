import { describe, expect, it } from 'vitest'
import { sendNotices, UPLOAD_FAILED, uploadNotice } from './send-notices'

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

describe('uploadNotice', () => {
  it('states the per-file and per-run size limits', () => {
    expect(uploadNotice('too_large')).toBe('Files must be 50 MB or smaller, and 48 MB in total per run')
  })

  it('explains the count and type limits', () => {
    expect(uploadNotice('too_many')).toBe('Attach up to 5 files')
    expect(uploadNotice('bad_type')).toBe('Use PDF, Markdown or text files')
  })

  it('falls back to a generic failure for missing objects and unknown errors', () => {
    expect(uploadNotice('missing')).toBe(UPLOAD_FAILED)
    expect(uploadNotice('upload_failed')).toBe(UPLOAD_FAILED)
    expect(uploadNotice('Failed to fetch')).toBe(UPLOAD_FAILED)
    expect(uploadNotice(undefined)).toBe(UPLOAD_FAILED)
  })
})

describe('sendNotices with plans', () => {
  const base = {
    maxRunsPerDay: 4,
    maxRounds: 5,
    anonymous: false,
    signedInMaxRunsPerDay: 2,
    resetAt: '2026-12-03T07:00:00.000Z',
  }

  it.each([
    ['free', "You've used your free runs this month. Upgrade for more."],
    ['starter', "You've used your Starter runs. Upgrade to Pro for more."],
    ['pro', "You've used your Pro runs."],
  ] as const)('names the %s plan and the reset date', (plan, text) => {
    const notice = sendNotices({ ...base, plan }, true).quota_exceeded
    expect(notice).toContain(text)
    expect(notice).toContain('Dec 3')
  })

  it('points a guest to sign in only when sign-in exists', () => {
    const guest = { ...base, plan: 'guest', resetAt: null, anonymous: true } as const
    expect(sendNotices(guest, true).quota_exceeded).toBe("You've used your free run. Sign in for 2 free runs a month.")
    expect(sendNotices(guest, false).quota_exceeded).toBe("You've used your free run.")
  })

  it('says the plan caps rounds, not the demo', () => {
    expect(sendNotices({ ...base, plan: 'starter' }, true).rounds_exceeded).toBe('Your plan allows up to 5 rounds.')
  })
})
