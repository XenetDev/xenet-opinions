import type { Run } from '@xo/db'
import type { RunStatus } from '@xo/mirofish'
import { CLOSE_WAIT_DEADLINE_MS } from '../follow-up/keepalive'
import type { Stage } from '../parts'
import { need, StageError } from './emit'
import type { Deps } from './types'

const ENV_STAGES: Stage[] = ['sim_run', 'interviews', 'report']

const exited = (status: Pick<RunStatus, 'runner_status'>) =>
  status.runner_status === 'completed' || status.runner_status === 'stopped'

export async function closeEnvAndWait(
  run: Run,
  deps: Deps,
  status?: Pick<RunStatus, 'runner_status'>,
): Promise<{ run: Run; closed: boolean }> {
  if (status && exited(status)) return { run, closed: true }
  const simulationId = need(run.ids.simulationId, 'simulationId')
  const now = deps.now()
  if (!run.cursors.envCloseRequested) {
    await deps.mirofish.simulation.closeEnv(simulationId)
    const requested = await deps.store.update(
      run.id,
      { cursors: { envCloseRequested: true, closeWaitStartedAt: now.toISOString() } },
      deps.fence,
    )
    return { run: requested, closed: false }
  }
  if (exited(status ?? (await deps.mirofish.simulation.runStatus(simulationId)))) return { run, closed: true }
  const startedAt = run.cursors.closeWaitStartedAt
  if (!startedAt) {
    const waiting = await deps.store.update(run.id, { cursors: { closeWaitStartedAt: now.toISOString() } }, deps.fence)
    return { run: waiting, closed: false }
  }
  if (now.getTime() - Date.parse(startedAt) > CLOSE_WAIT_DEADLINE_MS) {
    throw new StageError('env_stuck', 'The simulation environment did not close in time')
  }
  return { run, closed: false }
}

export async function cleanupEnv(run: Run, deps: Pick<Deps, 'mirofish' | 'log'>): Promise<void> {
  const simulationId = run.ids.simulationId
  if (!simulationId || !ENV_STAGES.includes(run.stage)) return
  try {
    await deps.mirofish.simulation.stop(simulationId)
  } catch (error) {
    deps.log('simulation stop failed', { runId: run.id, simulationId, error })
  }
  try {
    await deps.mirofish.simulation.closeEnv(simulationId)
  } catch (error) {
    deps.log('simulation closeEnv failed', { runId: run.id, simulationId, error })
  }
}
