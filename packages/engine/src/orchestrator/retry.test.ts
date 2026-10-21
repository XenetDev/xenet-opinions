import type { Run, RunCursors, RunIds } from '@xo/db'
import { describe, expect, it } from 'vitest'
import { prepareRetry } from './retry'
import { HANDLERS } from './stages'
import type { ActiveStage } from './types'

const ids: RunIds = {
  projectId: 'p',
  graphId: 'g',
  graphTaskId: 'gt',
  simulationId: 's',
  prepareTaskId: 'pt',
  reportId: 'r',
  reportTaskId: 'rt',
}
const cursors: RunCursors = {
  prepareReady: true,
  simStarted: true,
  startAcked: true,
  reportEventCount: 3,
  reportOutline: { sections: [] },
  agentLogLine: 9,
  retries: 2,
  startAttempts: 1,
  idlePolls: 4,
}

const failedAt = (stage: ActiveStage, extra: { ids?: RunIds; cursors?: RunCursors } = {}) =>
  ({
    stage,
    status: 'failed',
    ids: extra.ids ?? ids,
    cursors: extra.cursors ?? cursors,
    error: { stage, code: 'api', message: 'boom' },
  }) as Run

describe('prepareRetry', () => {
  it.each([
    ['graph_build', { ids: { projectId: 'p', graphTaskId: 'gt' } }],
    ['sim_prepare', { ids: { projectId: 'p', graphId: 'g', simulationId: 's', prepareTaskId: 'pt' }, cursors: { ...cursors, prepareReady: true } }],
    ['sim_run', {}],
    ['report', {}],
  ] as const)('resets %s so the stage enters again', (stage, extra) => {
    const run = failedAt(stage, extra)
    const next = prepareRetry(run)
    expect(next.stage).toBe(stage)
    expect(HANDLERS[stage].hasEntered({ ...run, ...next, status: 'queued', error: null })).toBe(false)
    expect(next.cursors).toMatchObject({ retries: 0, startAttempts: 0, idlePolls: 0 })
  })

  it('keeps upstream ids and drops report cursors on a report retry', () => {
    const next = prepareRetry(failedAt('report'))
    expect(next.ids).toEqual({ projectId: 'p', graphId: 'g', graphTaskId: 'gt', simulationId: 's', prepareTaskId: 'pt' })
    expect(next.cursors).toEqual({ prepareReady: true, simStarted: true, startAcked: true, retries: 0, startAttempts: 0, idlePolls: 0 })
  })

  it('uses run.stage when there is no error', () => {
    expect(prepareRetry({ ...failedAt('sim_run'), error: null }).stage).toBe('sim_run')
  })

  it('does not mutate the source run', () => {
    const run = failedAt('report')
    prepareRetry(run)
    expect(run.ids).toEqual(ids)
    expect(run.cursors).toEqual(cursors)
  })
})
