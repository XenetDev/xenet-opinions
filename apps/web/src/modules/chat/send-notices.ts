import type { Limits } from '@/server/limits'

export const SEND_FAILED = 'Something went wrong sending your message'

const quotaNotice = (runs: number) =>
  `You've used today's ${runs === 1 ? '' : `${runs === 2 ? 'two' : runs} `}run${runs === 1 ? '' : 's'}. Come back tomorrow.`

export const sendNotices = (limits: Pick<Limits, 'maxRunsPerDay' | 'maxRounds'>): Record<string, string> => ({
  run_active: 'A run is already in progress for this chat.',
  follow_up_failed: 'The report agent did not answer. Try again.',
  follow_up_unavailable: 'Follow-ups are not available for this run.',
  demo_paused: 'The demo is paused right now. Try again later.',
  quota_exceeded: quotaNotice(limits.maxRunsPerDay),
  rounds_exceeded: `The demo allows up to ${limits.maxRounds} rounds.`,
})
