import type { Run } from '@xo/db'
import { englishMessage, MiroFishError, NO_ACTORS_MESSAGE } from '@xo/mirofish'
import type { Stage } from '../parts'
import { event, StageError } from './emit'
import { cleanupEnv } from './env'
import { offlineInterviews } from './interview-rows'
import type { Deps } from './types'

const MAX_MESSAGE = 300

export const NO_ACTORS_CODE = 'no_actors'

export const messageOf = (err: unknown) => {
  if (!(err instanceof Error) || err.name === 'ZodError') return 'Internal error'
  const line = err.message
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  return line ? englishMessage(line).slice(0, MAX_MESSAGE) : 'Internal error'
}

export const isRetriable = (err: unknown) =>
  err instanceof MiroFishError &&
  (err.code === 'network' || err.code === 'timeout' || (err.code === 'http' && (err.status ?? 0) >= 500))

export async function fail(run: Run, deps: Deps, stage: Stage, err: unknown): Promise<Run> {
  const message = messageOf(err)
  const baseCode = err instanceof MiroFishError || err instanceof StageError ? err.code : 'internal'
  const code = message === NO_ACTORS_MESSAGE ? NO_ACTORS_CODE : baseCode
  deps.log('run failed', { runId: run.id, stage, code, message, error: err })
  const offline = stage === 'interviews' ? await offlineInterviews(deps.store, run.id) : undefined
  const failed = await deps.store.transition(
    run.id,
    {
      status: 'failed',
      finishedAt: deps.now(),
      error: { stage, code, message },
      ...(run.envState === 'open' ? { envState: 'closed', envKeepaliveUntil: null } : {}),
    },
    [
      ...(offline?.events ?? []),
      event('stage', { stage, status: 'failed', message }),
      event('error', { stage, code, message }),
    ],
    deps.fence,
  )
  await offline?.settle()
  await cleanupEnv({ ...run, stage }, deps)
  return failed
}
