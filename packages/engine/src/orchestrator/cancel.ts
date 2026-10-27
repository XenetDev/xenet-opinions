import type { Run } from '@xo/db'
import type { Stage } from '../parts'
import type { RunStore } from '../store/types'
import { event } from './emit'

const MESSAGE = 'Cancelled by user'

export async function cancelRun(store: RunStore, runId: string, now: Date): Promise<Run> {
  const run = await store.get(runId)
  if (!run) throw new Error('run_not_found')
  return store.transition(
    runId,
    {
      status: 'cancelled',
      finishedAt: now,
      error: null,
      leaseUntil: now,
      ...(run.envState === 'open' ? { envState: 'closed', envKeepaliveUntil: null } : {}),
    },
    [
      event('stage', { stage: run.stage as Stage, status: 'cancelled', message: MESSAGE }),
      event('cancelled', { stage: run.stage as Stage, message: MESSAGE }),
    ],
    undefined,
    { expectStatus: ['queued', 'running'] },
  )
}
