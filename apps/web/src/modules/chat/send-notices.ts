import type { Limits } from '@/server/limits'

export const SEND_FAILED = 'Something went wrong sending your message'
export const FILES_REQUIRED = 'Attach at least one document (.pdf, .md or .txt) to start a run.'

const quotaNotice = (runs: number) =>
  `You've used today's ${runs === 1 ? '' : `${runs === 2 ? 'two' : runs} `}run${runs === 1 ? '' : 's'}. Come back tomorrow.`

const freeRuns = (runs: number) => (runs === 1 ? 'free run' : `${runs} free runs`)

export const sendNotices = (
  limits: Pick<Limits, 'maxRunsPerDay' | 'maxRounds' | 'anonymous' | 'signedInMaxRunsPerDay'>,
  signInAvailable: boolean,
): Record<string, string> => ({
  run_active: 'A run is already in progress for this chat.',
  follow_up_failed: 'The report agent did not answer. Try again.',
  follow_up_unavailable: 'Follow-ups are not available for this run.',
  demo_paused: 'The demo is paused right now. Try again later.',
  quota_exceeded:
    limits.anonymous && signInAvailable
      ? `You've used today's ${freeRuns(limits.maxRunsPerDay)}. Sign in for ${limits.signedInMaxRunsPerDay} runs a day, or come back tomorrow.`
      : quotaNotice(limits.maxRunsPerDay),
  rounds_exceeded: `The demo allows up to ${limits.maxRounds} rounds.`,
})
