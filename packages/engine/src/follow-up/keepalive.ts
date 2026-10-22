import type { Run } from '@xo/db'

export const ENV_KEEPALIVE_MS = 20 * 60_000
export const ENV_INTERVIEW_EXTEND_MS = 10 * 60_000
export const ENV_KEEPALIVE_CAP_MS = 60 * 60_000
export const MAX_INTERVIEW_AGENTS = 5
export const CHAT_HISTORY_TURNS = 10

export const keepaliveAfterFinish = (finishedAt: Date, keepaliveMs = ENV_KEEPALIVE_MS) =>
  new Date(finishedAt.getTime() + keepaliveMs)

export const extendKeepalive = (run: Pick<Run, 'finishedAt' | 'envKeepaliveUntil'>, now: Date) => {
  const current = (run.envKeepaliveUntil ?? now).getTime()
  const base = Math.max(current, now.getTime())
  const cap = (run.finishedAt ?? now).getTime() + ENV_KEEPALIVE_CAP_MS
  return new Date(Math.max(current, Math.min(base + ENV_INTERVIEW_EXTEND_MS, cap)))
}
