import type { Run } from '@xo/db'
import { advance, emit, need, remoteFailure, running } from '../emit'
import { graphDataToPart } from '../mirofish-map'
import type { Deps, StageHandler } from '../types'

const finish = async (run: Run, deps: Deps, graphId: string) => {
  const data = await deps.mirofish.graph.getData(graphId)
  await emit(deps, run, 'graph', graphDataToPart(graphId, data))
  return advance(deps, run, 'graph_build', 'sim_create')
}

const graphIdOf = (result: unknown) => {
  const id = (result as { graph_id?: unknown } | null | undefined)?.graph_id
  return typeof id === 'string' && id ? id : undefined
}

export const graphBuild: StageHandler = {
  stage: 'graph_build',
  hasEntered: (run) => Boolean(run.ids.graphTaskId || run.ids.graphId),
  async enter(run, deps) {
    const started = await deps.mirofish.graph.build({ projectId: need(run.ids.projectId, 'projectId') })
    if (started.reused && started.graph_id) {
      const entered = await deps.store.update(run.id, { ids: { graphId: started.graph_id } })
      await running(deps, entered, 'graph_build', { progress: 100, message: 'Reusing existing graph' })
      return finish(entered, deps, started.graph_id)
    }
    const entered = await deps.store.update(run.id, { ids: { graphTaskId: need(started.task_id, 'graph build task id') } })
    await running(deps, entered, 'graph_build', { progress: 0, message: 'Building knowledge graph' })
    return entered
  },
  async poll(run, deps) {
    if (run.ids.graphId) return finish(run, deps, run.ids.graphId)
    const taskId = need(run.ids.graphTaskId, 'graphTaskId')
    const task = await deps.mirofish.graph.getTask(taskId)
    if (task.status === 'failed') throw remoteFailure(task.error ?? task.message, 'Graph build failed', `/api/graph/task/${taskId}`)
    if (task.status === 'completed') {
      const graphId = need(graphIdOf(task.result), 'graph_id in graph build result')
      return finish(await deps.store.update(run.id, { ids: { graphId } }), deps, graphId)
    }
    await running(deps, run, 'graph_build', { progress: task.progress, ...(task.message ? { message: task.message } : {}) })
    return run
  },
}
