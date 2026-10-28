import { env } from '@/env'

export type Limits = {
  demoMode: boolean
  paused: boolean
  maxRunsPerDay: number
  signedInMaxRunsPerDay: number
  anonymous: boolean
  maxRounds: number
  allowPause: boolean
}

type LimitsEnv = Pick<
  typeof env,
  | 'DEMO_MODE'
  | 'DEMO_PAUSED'
  | 'DEMO_ALLOW_PAUSE'
  | 'MAX_RUNS_PER_DAY'
  | 'MAX_RUNS_PER_DAY_ANONYMOUS'
  | 'DEMO_MAX_ROUNDS'
>

export function limitsFromEnv(source: LimitsEnv, user: { isAnonymous: boolean }): Limits {
  const demoMode = source.DEMO_MODE === '1'
  return {
    demoMode,
    paused: source.DEMO_PAUSED === '1',
    maxRunsPerDay: user.isAnonymous ? source.MAX_RUNS_PER_DAY_ANONYMOUS : source.MAX_RUNS_PER_DAY,
    signedInMaxRunsPerDay: source.MAX_RUNS_PER_DAY,
    anonymous: user.isAnonymous,
    maxRounds: demoMode ? source.DEMO_MAX_ROUNDS : 40,
    allowPause: source.DEMO_ALLOW_PAUSE === '1',
  }
}

export function getLimits(user: { isAnonymous: boolean }): Limits {
  return limitsFromEnv(env, user)
}
