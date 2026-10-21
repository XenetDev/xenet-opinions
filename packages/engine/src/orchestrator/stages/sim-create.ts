import { advance, need, running } from '../emit'
import type { StageHandler } from '../types'

export const simCreate: StageHandler = {
  stage: 'sim_create',
  hasEntered: (run) => Boolean(run.ids.simulationId),
  async enter(run, deps) {
    const sim = await deps.mirofish.simulation.create({
      projectId: need(run.ids.projectId, 'projectId'),
      graphId: need(run.ids.graphId, 'graphId'),
    })
    const entered = await deps.store.update(run.id, { ids: { simulationId: sim.simulation_id } }, deps.fence)
    await running(deps, entered, 'sim_create', { message: 'Creating the simulation' })
    return advance(deps, entered, 'sim_create', 'sim_prepare')
  },
  poll: (run, deps) => advance(deps, run, 'sim_create', 'sim_prepare'),
}
