import type { Deps } from './types'

export async function sweepEnvs(deps: Pick<Deps, 'store' | 'mirofish' | 'now' | 'log'>): Promise<string[]> {
  const { store, mirofish, log } = deps
  const closed: string[] = []
  for (const run of await store.listEnvsToSweep(deps.now(), 50)) {
    if (!(await store.closeEnv(run.id))) continue
    const simulationId = run.ids.simulationId
    if (simulationId) {
      try {
        await mirofish.simulation.stop(simulationId)
      } catch {}
      try {
        await mirofish.simulation.closeEnv(simulationId)
      } catch (error) {
        log('simulation closeEnv failed', { runId: run.id, simulationId, error })
      }
    }
    closed.push(run.id)
  }
  return closed
}
