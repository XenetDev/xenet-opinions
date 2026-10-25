import type { Run } from '@xo/db'
import { MiroFishError } from '@xo/mirofish'
import type { Stage } from '../parts'
import { event } from './emit'
import type { Deps } from './types'

const MAX_MESSAGE = 300

export const messageOf = (err: unknown) => {
  if (!(err instanceof Error) || err.name === 'ZodError') return 'Internal error'
  const line = err.message
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  return line ? line.slice(0, MAX_MESSAGE) : 'Internal error'
}

export const isRetriable = (err: unknown) =>
  err instanceof MiroFishError &&
  (err.code === 'network' || err.code === 'timeout' || (err.code === 'http' && (err.status ?? 0) >= 500))

export async function fail(run: Run, deps: Deps, stage: Stage, err: unknown): Promise<Run> {
  const code = err instanceof MiroFishError ? err.code : 'internal'
  const message = messageOf(err)
  deps.log('run failed', { runId: run.id, stage, code, message, error: err })
  return deps.store.transition(
    run.id,
    { status: 'failed', finishedAt: deps.now(), error: { stage, code, message } },
    [event('stage', { stage, status: 'failed', message }), event('error', { stage, code, message })],
    deps.fence,
  )
}
