import type { Limits } from '@/server/limits'

export const SEND_FAILED = 'Something went wrong sending your message'
export const UPLOAD_FAILED = 'Upload failed. Try again.'

const UPLOAD_NOTICES: Record<string, string> = {
  too_large: 'Files must be 50 MB or smaller, and 48 MB in total per run',
  too_many: 'Attach up to 5 files',
  bad_type: 'Use PDF, Markdown or text files',
}

export const uploadNotice = (reason: string | undefined) => (reason && UPLOAD_NOTICES[reason]) || UPLOAD_FAILED

const quotaNotice = (runs: number) =>
  `You've used today's ${runs === 1 ? '' : `${runs === 2 ? 'two' : runs} `}run${runs === 1 ? '' : 's'}. Come back tomorrow.`

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })

const planQuotaNotice = (
  limits: Pick<Limits, 'plan' | 'resetAt' | 'signedInMaxRunsPerDay'>,
  signInAvailable: boolean,
) => {
  const when = limits.resetAt ? shortDate(limits.resetAt) : ''
  const reset = when ? `They reset on ${when}.` : ''
  const renew = when ? `They renew on ${when}.` : ''
  switch (limits.plan) {
    case 'guest':
      return signInAvailable
        ? `You've used your free run. Sign in for ${limits.signedInMaxRunsPerDay} free runs a month.`
        : "You've used your free run."
    case 'free':
      return `You've used your free runs this month. Upgrade for more. ${reset}`.trim()
    case 'starter':
      return `You've used your Starter runs. Upgrade to Pro for more. ${renew}`.trim()
    default:
      return `You've used your Pro runs. ${renew}`.trim()
  }
}

const freeRuns = (runs: number) => (runs === 1 ? 'free run' : `${runs} free runs`)

export const sendNotices = (
  limits: Pick<
    Limits,
    'maxRunsPerDay' | 'maxRounds' | 'maxParticipants' | 'anonymous' | 'signedInMaxRunsPerDay' | 'plan' | 'resetAt'
  >,
  signInAvailable: boolean,
): Record<string, string> => ({
  run_active: 'A run is already in progress for this chat.',
  follow_up_failed: 'The report agent did not answer. Try again.',
  follow_up_unavailable: 'Follow-ups are not available for this run.',
  demo_paused: 'The demo is paused right now. Try again later.',
  quota_exceeded: limits.plan
    ? planQuotaNotice(limits, signInAvailable)
    : limits.anonymous && signInAvailable
      ? `You've used today's ${freeRuns(limits.maxRunsPerDay)}. Sign in for ${limits.signedInMaxRunsPerDay} runs a day, or come back tomorrow.`
      : quotaNotice(limits.maxRunsPerDay),
  rounds_exceeded: `${limits.plan ? 'Your plan' : 'The demo'} allows up to ${limits.maxRounds} rounds.`,
  participants_exceeded: `${limits.plan ? 'Your plan' : 'The demo'} allows up to ${limits.maxParticipants} participants.`,
})
