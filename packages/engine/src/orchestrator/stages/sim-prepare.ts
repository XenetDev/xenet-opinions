import type { Run } from '@xo/db'
import type { AgentsData } from '../../parts'
import { advance, emit, need, remoteFailure, running } from '../emit'
import { configToPlatform, profilesToPart } from '../mirofish-map'
import type { Deps, StageHandler } from '../types'

const fetchAgents = async (deps: Deps, simulationId: string) =>
  profilesToPart(await deps.mirofish.simulation.profilesRealtime(simulationId))

const fetchPlatform = async (run: Run, deps: Deps, simulationId: string) => {
  try {
    return configToPlatform(await deps.mirofish.simulation.configRealtime(simulationId))
  } catch (error) {
    deps.log('simulation config unavailable, assuming reddit', { runId: run.id, simulationId, error })
    return 'reddit' as const
  }
}

const emitAgents = async (run: Run, deps: Deps, agents: AgentsData, force = false) => {
  if (!force && agents.count === (run.cursors.lastAgentCount ?? 0)) return run
  await emit(deps, run, 'agents', agents)
  return deps.store.update(run.id, { cursors: { lastAgentCount: agents.count } }, deps.fence)
}

const finish = async (run: Run, deps: Deps, agents: AgentsData) => {
  const platform = await fetchPlatform(run, deps, need(run.ids.simulationId, 'simulationId'))
  return advance(deps, await emitAgents(run, deps, { ...agents, platform }, true), 'sim_prepare', 'sim_run')
}

const stageName = (detail: unknown) => {
  const name = (detail as { current_stage_name?: unknown } | null | undefined)?.current_stage_name
  return typeof name === 'string' && name ? name : undefined
}

export const simPrepare: StageHandler = {
  stage: 'sim_prepare',
  hasEntered: (run) => Boolean(run.ids.prepareTaskId || run.cursors.prepareReady),
  async enter(run, deps) {
    const simulationId = need(run.ids.simulationId, 'simulationId')
    const started = await deps.mirofish.simulation.prepare({ simulationId })
    if (started.already_prepared) {
      const entered = await deps.store.update(run.id, { cursors: { prepareReady: true } }, deps.fence)
      await running(deps, entered, 'sim_prepare', { progress: 100, message: 'Agents already prepared' })
      return finish(entered, deps, await fetchAgents(deps, simulationId))
    }
    const entered = await deps.store.update(
      run.id,
      { ids: { prepareTaskId: need(started.task_id, 'prepare task id') } },
      deps.fence,
    )
    await running(deps, entered, 'sim_prepare', { progress: 0, message: 'Generating agent profiles' })
    return entered
  },
  async poll(run, deps) {
    const simulationId = need(run.ids.simulationId, 'simulationId')
    const taskId = run.ids.prepareTaskId
    if (!taskId) return finish(run, deps, await fetchAgents(deps, simulationId))
    const status = await deps.mirofish.simulation.prepareStatus({ simulationId, taskId })
    if (status.status === 'failed') {
      throw remoteFailure(status.error ?? status.message, 'Agent preparation failed', '/api/simulation/prepare/status')
    }
    const agents = await fetchAgents(deps, simulationId)
    if (status.status === 'completed' || status.status === 'ready' || status.already_prepared === true)
      return finish(run, deps, agents)
    const message = stageName(status.progress_detail) ?? status.message ?? undefined
    await running(deps, run, 'sim_prepare', { progress: status.progress, ...(message ? { message } : {}) })
    return emitAgents(run, deps, agents)
  },
}
