import type { Run } from '@xo/db'

export const ENV_INTERVIEW_EXTEND_MS = 10 * 60_000
export const ENV_KEEPALIVE_CAP_MS = 60 * 60_000
export const MAX_INTERVIEW_AGENTS = 5
export const CHAT_HISTORY_TURNS = 10

export const INTERVIEW_WINDOW_MS = 20 * 60_000
export const INTERVIEW_EXTEND_PER_PERSONA_MS = 5 * 60_000
export const INTERVIEW_WINDOW_CAP_MS = 60 * 60_000
export const ENV_CHECK_INTERVAL_MS = 30_000
export const CLOSE_WAIT_DEADLINE_MS = 3 * 60_000
export const INTERVIEW_MIROFISH_TIMEOUT_S = 240
export const INTERVIEW_CLIENT_TIMEOUT_MS = 270_000

export const extendKeepalive = (run: Pick<Run, 'finishedAt' | 'envKeepaliveUntil'>, now: Date) => {
  const current = (run.envKeepaliveUntil ?? now).getTime()
  const base = Math.max(current, now.getTime())
  const cap = (run.finishedAt ?? now).getTime() + ENV_KEEPALIVE_CAP_MS
  return new Date(Math.max(current, Math.min(base + ENV_INTERVIEW_EXTEND_MS, cap)))
}

export const extendInterviewWindow = (run: Pick<Run, 'envKeepaliveUntil' | 'cursors'>, personas: number, now: Date) => {
  const base = Math.max((run.envKeepaliveUntil ?? now).getTime(), now.getTime())
  const started = run.cursors.interviewsStartedAt ? Date.parse(run.cursors.interviewsStartedAt) : now.getTime()
  return new Date(Math.min(base + INTERVIEW_EXTEND_PER_PERSONA_MS * personas, started + INTERVIEW_WINDOW_CAP_MS))
}
