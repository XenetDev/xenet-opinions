import { describe, expect, it, vi } from 'vitest'
import { sweepEnvs } from './sweeper'
import { NOW, setupRun } from './test-helpers'

const expired = new Date(NOW.getTime() - 1000)
const finish = (store: Awaited<ReturnType<typeof setupRun>>['store'], id: string, patch = {}) =>
  store.update(id, { status: 'done', envState: 'open', envKeepaliveUntil: expired, ...patch })

describe('sweepEnvs', () => {
  it('stops and closes each expired environment once, then marks it closed', async () => {
    const { store, deps, run } = await setupRun()
    await finish(store, run.id, { ids: { simulationId: 'sim_1' } })
    expect(await sweepEnvs(deps)).toEqual([run.id])
    expect(deps.mirofish.simulation.stop).toHaveBeenCalledWith('sim_1')
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledWith('sim_1')
    expect(deps.mirofish.simulation.stop).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
    expect((await store.get(run.id))?.envState).toBe('closed')
    expect(await sweepEnvs(deps)).toEqual([])
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
  })

  it('a second worker over the same listed rows makes no MiroFish calls', async () => {
    const { store, deps, run } = await setupRun()
    await finish(store, run.id, { ids: { simulationId: 'sim_1' } })
    const listed = await store.listEnvsToSweep(NOW, 50)
    const stale = { ...store, listEnvsToSweep: async () => listed }
    expect(await sweepEnvs(deps)).toEqual([run.id])
    expect(await sweepEnvs({ ...deps, store: stale })).toEqual([])
    expect(deps.mirofish.simulation.stop).toHaveBeenCalledTimes(1)
    expect(deps.mirofish.simulation.closeEnv).toHaveBeenCalledTimes(1)
  })

  it('closes the row even when MiroFish calls fail', async () => {
    const boom = vi.fn(async () => {
      throw new Error('down')
    })
    const { store, deps, run } = await setupRun({ simulation: { stop: boom, closeEnv: boom } as never })
    await finish(store, run.id, { ids: { simulationId: 'sim_1' } })
    expect(await sweepEnvs(deps)).toEqual([run.id])
    expect((await store.get(run.id))?.envState).toBe('closed')
    expect(deps.log).toHaveBeenCalledWith('simulation closeEnv failed', expect.objectContaining({ runId: run.id }))
  })

  it('skips MiroFish for runs without a simulation id', async () => {
    const { store, deps, run } = await setupRun()
    await finish(store, run.id)
    expect(await sweepEnvs(deps)).toEqual([run.id])
    expect(deps.mirofish.simulation.stop).not.toHaveBeenCalled()
    expect(deps.mirofish.simulation.closeEnv).not.toHaveBeenCalled()
    expect((await store.get(run.id))?.envState).toBe('closed')
  })

  it('leaves unexpired environments open', async () => {
    const { store, deps, run } = await setupRun()
    await finish(store, run.id, { envKeepaliveUntil: new Date(NOW.getTime() + 60_000) })
    expect(await sweepEnvs(deps)).toEqual([])
    expect((await store.get(run.id))?.envState).toBe('open')
  })
})
