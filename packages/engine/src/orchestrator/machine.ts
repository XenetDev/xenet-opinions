import type { Run } from '@xo/db'
import { event } from './emit'
import { fail, isRetriable, messageOf } from './fail'
import { HANDLERS } from './stages'
import type { Deps } from './types'

export { fail } from './fail'

const BACKOFF_MS = [2000, 4000, 8000]

export async function tick(run: Run, deps: Deps): Promise<Run> {
  if (run.stage === 'finished') {
    return deps.store.transition(run.id, { status: 'done', finishedAt: deps.now(), envState: 'open' }, [
      event('stage', { stage: 'finished', status: 'done' }),
      event('done', {}),
    ])
  }
  const handler = HANDLERS[run.stage]
  try {
    const next = handler.hasEntered(run) ? await handler.poll(run, deps) : await handler.enter(run, deps)
    return next.status === 'running' && next.cursors.retries ? await deps.store.update(next.id, { cursors: { retries: 0 } }) : next
  } catch (err) {
    const current = (await deps.store.get(run.id)) ?? run
    const attempt = (current.cursors.retries ?? 0) + 1
    const delay = BACKOFF_MS[attempt - 1]
    if (!isRetriable(err) || delay === undefined) return fail(current, deps, run.stage, err)
    deps.log('retrying stage', { runId: run.id, stage: run.stage, attempt, delay, message: messageOf(err) })
    const retrying = await deps.store.update(run.id, { cursors: { retries: attempt } })
    await deps.sleep(delay)
    return retrying
  }
}
