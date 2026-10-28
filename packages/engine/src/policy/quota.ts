export const MAX_RUNS_PER_DAY = 3
export const MAX_RUNS_PER_DAY_ANONYMOUS = 1
export const DEMO_MAX_ROUNDS = 3
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000

export type RunPolicyInput = {
  demoMode: boolean
  paused: boolean
  runsInWindow: number
  maxRunsPerDay: number
  requestedRounds: number
  maxRounds: number
  windowStartedAt: Date
}

export type RunPolicyResult =
  | { ok: true }
  | { ok: false; code: 'demo_paused' | 'quota_exceeded' | 'rounds_exceeded'; resetAt?: Date; max?: number }

export function checkRunPolicy(input: RunPolicyInput): RunPolicyResult {
  if (input.paused) return { ok: false, code: 'demo_paused' }
  if (!input.demoMode) return { ok: true }
  if (input.runsInWindow >= input.maxRunsPerDay) {
    return {
      ok: false,
      code: 'quota_exceeded',
      resetAt: new Date(input.windowStartedAt.getTime() + QUOTA_WINDOW_MS),
      max: input.maxRunsPerDay,
    }
  }
  if (input.requestedRounds > input.maxRounds) return { ok: false, code: 'rounds_exceeded', max: input.maxRounds }
  return { ok: true }
}
