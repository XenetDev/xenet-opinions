import type { Run, RunCursors, RunIds } from '@xo/db'
import { STAGES, type Stage } from '../parts'

const RESET: Partial<Record<Stage, { ids: (keyof RunIds)[]; cursors: (keyof RunCursors)[] }>> = {
  graph_build: { ids: ['graphTaskId'], cursors: [] },
  sim_prepare: { ids: ['prepareTaskId'], cursors: ['prepareReady'] },
  sim_run: { ids: [], cursors: ['simStarted', 'startAcked'] },
  report: { ids: ['reportId', 'reportTaskId'], cursors: ['reportEventCount', 'reportOutline', 'agentLogLine'] },
}

export function prepareRetry(run: Run): { ids: RunIds; cursors: RunCursors; stage: Stage } {
  const stage = (run.error?.stage ?? run.stage) as Stage
  const ids: RunIds = { ...run.ids }
  const cursors: RunCursors = { ...run.cursors }
  for (const later of STAGES.slice(STAGES.indexOf(stage))) {
    for (const key of RESET[later]?.ids ?? []) delete ids[key]
    for (const key of RESET[later]?.cursors ?? []) delete cursors[key]
  }
  return { ids, cursors: { ...cursors, retries: 0, startAttempts: 0, idlePolls: 0 }, stage }
}
