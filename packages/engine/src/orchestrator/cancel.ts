import type { Run } from '@xo/db'
import type { Stage } from '../parts'
import type { RunStore } from '../store/types'
import { event } from './emit'
import { offlineInterviews } from './interview-rows'

const MESSAGE = 'Cancelled by user'

export async function cancelRun(store: RunStore, runId: string, now: Date): Promise<Run> {
  const run = await store.get(runId)
  if (!run) throw new Error('run_not_found')
  const offline = run.stage === 'interviews' ? await offlineInterviews(store, runId) : undefined
  const cancelled = await store.transition(
    runId,
    {
      status: 'cancelled',
      finishedAt: now,
      error: null,
      leaseUntil: now,
      ...(run.envState === 'open' ? { envState: 'closed', envKeepaliveUntil: null } : {}),
    },
    [
      ...(offline?.events ?? []),
      event('stage', { stage: run.stage as Stage, status: 'cancelled', message: MESSAGE }),
      event('cancelled', { stage: run.stage as Stage, message: MESSAGE }),
    ],
    undefined,
    { expectStatus: ['queued', 'running'] },
  )
  await offline?.settle()
  return cancelled
}
