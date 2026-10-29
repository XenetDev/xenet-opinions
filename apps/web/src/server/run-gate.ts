import { checkRunPolicy, QUOTA_WINDOW_MS } from '@xo/engine'
import type { SessionUser } from '@/lib/session'
import { getLimits, type Limits } from '@/server/limits'
import { runsStartedSince } from '@/server/runs'

type Window = Awaited<ReturnType<typeof runsStartedSince>>

export type RunGate = { ok: true; limits: Limits; window: Window } | { ok: false; response: Response }

export async function checkRunGate(
  user: SessionUser,
  options: { requestedRounds?: number; spendsQuota?: boolean } = {},
): Promise<RunGate> {
  const { requestedRounds = 0, spendsQuota = true } = options
  const limits = getLimits(user)
  const now = new Date()
  const window =
    limits.demoMode && spendsQuota
      ? await runsStartedSince(user.id, new Date(now.getTime() - QUOTA_WINDOW_MS))
      : { count: 0, oldestQueuedAt: null }
  const policy = checkRunPolicy({
    demoMode: limits.demoMode,
    paused: limits.paused,
    runsInWindow: window.count,
    maxRunsPerDay: limits.maxRunsPerDay,
    requestedRounds,
    maxRounds: limits.maxRounds,
    windowStartedAt: window.oldestQueuedAt ?? now,
  })
  if (policy.ok) return { ok: true, limits, window }
  if (policy.code === 'demo_paused')
    return { ok: false, response: Response.json({ error: 'demo_paused' }, { status: 409 }) }
  if (policy.code === 'quota_exceeded')
    return {
      ok: false,
      response: Response.json({ error: 'quota_exceeded', resetAt: policy.resetAt?.toISOString() }, { status: 429 }),
    }
  return { ok: false, response: Response.json({ error: 'rounds_exceeded', max: policy.max }, { status: 400 }) }
}
