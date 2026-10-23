import { env } from '@/env'

export type Limits = { demoMode: boolean; paused: boolean; maxRunsPerDay: number; maxRounds: number }

type LimitsEnv = Pick<typeof env, 'DEMO_MODE' | 'DEMO_PAUSED' | 'MAX_RUNS_PER_DAY' | 'DEMO_MAX_ROUNDS'>

export function limitsFromEnv(source: LimitsEnv): Limits {
  const demoMode = source.DEMO_MODE === '1'
  return {
    demoMode,
    paused: source.DEMO_PAUSED === '1',
    maxRunsPerDay: source.MAX_RUNS_PER_DAY,
    maxRounds: demoMode ? source.DEMO_MAX_ROUNDS : 40,
  }
}

export function getLimits(): Limits {
  return limitsFromEnv(env)
}
