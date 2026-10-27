import { describe, expect, it, vi } from 'vitest'
import { StageError } from './emit'
import { cleanupEnv, closeEnvAndWait } from './env'
import { NOW, setupRun } from './test-helpers'

const ids = { projectId: 'proj_1', graphId: 'graph_1', simulationId: 'sim_1' }
const status = (runner_status: string) => ({ runner_status })

describe('closeEnvAndWait', () => {
  it('calls closeEnv once across ticks and resolves after stopping then completed', async () => {
    const runStatus = vi.fn().mockResolvedValueOnce(status('stopping')).mockResolvedValueOnce(status('completed'))
    const { deps, run } = await setupRun({ simulation: { runStatus } }, { stage: 'interviews', ids })
    const first = await closeEnvAndWait(run, deps)
    expect(first.closed).toBe(false)
    expect(first.run.cursors).toMatchObject({ envCloseRequested: true, closeWaitStartedAt: NOW.toISOString() })
    expect(runStatus).not.toHaveBeenCalled()
    const second = await closeEnvAndWait(first.run, deps)
    expect(second.closed).toBe(false)
    const third = await closeEnvAndWait(second.run, deps)
    expect(third.closed).toBe(true)
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledWith('sim_1')
    expect(runStatus).toHaveBeenCalledTimes(2)
  })

  it('uses a provided status instead of polling', async () => {
    const { deps, run } = await setupRun({}, { stage: 'sim_run', ids, cursors: { envCloseRequested: true } })
    const done = await closeEnvAndWait(run, deps, { runner_status: 'stopped' })
    expect(done.closed).toBe(true)
    expect(deps.mirofish.simulation.runStatus).not.toHaveBeenCalled()
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
  })

  it('fails with env_stuck after the deadline', async () => {
    const { deps, run } = await setupRun(
      { simulation: { runStatus: vi.fn(async () => ({ runner_status: 'stopping' as const })) } },
      { stage: 'interviews', ids },
    )
    const first = await closeEnvAndWait(run, deps)
    const late = { ...deps, now: () => new Date(NOW.getTime() + 3 * 60_000) }
    expect((await closeEnvAndWait(first.run, late)).closed).toBe(false)
    const stuck = { ...deps, now: () => new Date(NOW.getTime() + 3 * 60_000 + 1) }
    const err = await closeEnvAndWait(first.run, stuck).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StageError)
    expect((err as StageError).code).toBe('env_stuck')
  })
})

describe('cleanupEnv', () => {
  it.each(['sim_run', 'interviews', 'report'] as const)('stops and closes the env in %s', async (stage) => {
    const { deps, run } = await setupRun({}, { stage, ids })
    await cleanupEnv(run, deps)
    expect(deps.mirofish.simulation.stop).toHaveBeenCalledWith('sim_1')
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledWith('sim_1')
  })

  it('does nothing before the simulation runs or without a simulation id', async () => {
    const early = await setupRun({}, { stage: 'sim_prepare', ids })
    await cleanupEnv(early.run, early.deps)
    const noSim = await setupRun({}, { stage: 'report', ids: {} })
    await cleanupEnv(noSim.run, noSim.deps)
    for (const deps of [early.deps, noSim.deps]) {
      expect(deps.mirofish.simulation.stop).not.toHaveBeenCalled()
      expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
    }
  })

  it('swallows and logs errors', async () => {
    const boom = vi.fn(async () => {
      throw new Error('down')
    })
    const { deps, run } = await setupRun(
      { simulation: { stop: boom, closeEnv: boom } as never },
      {
        stage: 'interviews',
        ids,
      },
    )
    await expect(cleanupEnv(run, deps)).resolves.toBeUndefined()
    expect(boom).toHaveBeenCalledTimes(2)
    expect(deps.log).toHaveBeenCalledWith('simulation stop failed', expect.objectContaining({ runId: run.id }))
    expect(deps.log).toHaveBeenCalledWith('simulation closeEnv failed', expect.objectContaining({ runId: run.id }))
  })
})
