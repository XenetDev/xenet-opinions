import { MiroFishError } from '@xo/mirofish'
import { describe, expect, it, vi } from 'vitest'
import type { DebriefData } from '../parts'
import { FenceError } from '../store/types'
import { DEBRIEF_QUESTION, runDebrief } from './debrief'
import { setupRun } from './test-helpers'

const ids = { projectId: 'proj_1', graphId: 'graph_1', simulationId: 'sim_1' }

const withAgents = async (count: number, o: Parameters<typeof setupRun>[0] = {}) => {
  const ctx = await setupRun(o, { stage: 'sim_run', ids, cursors: { simStarted: true, startAcked: true } })
  const debriefs = () => (ctx.store.events.get(ctx.run.id) ?? []).filter((e) => e.kind === 'debrief')
  const answers = () => (debriefs()[0]?.payload as DebriefData | undefined)?.answers ?? []
  if (count === 0) return { ...ctx, debriefs, answers }
  const profiles = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Agent ${i}`, topics: [] }))
  await ctx.store.appendEvent(ctx.run.id, {
    kind: 'agents',
    partId: 'agents',
    payload: { count, profiles, platform: 'twitter' },
  })
  return { ...ctx, debriefs, answers }
}

describe('runDebrief', () => {
  it('interviews every agent in batches of 10 and emits one debrief event', async () => {
    const { deps, run, debriefs, answers } = await withAgents(23)
    const next = await runDebrief(run, deps)
    const batch = vi.mocked(deps.mirofish.simulation.interviewBatch)
    expect(batch.mock.calls.map((c) => c[0].interviews.length)).toEqual([10, 10, 3])
    expect(batch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ simulationId: 'sim_1', platform: 'twitter', timeout: 240 }),
      { timeoutMs: 270_000 },
    )
    expect(batch.mock.calls[0]?.[0].interviews[0]).toEqual({ agentId: 0, prompt: DEBRIEF_QUESTION })
    expect(next.cursors.debriefDone).toBe(true)
    expect(debriefs()).toHaveLength(1)
    expect(answers()).toHaveLength(23)
    expect(answers()[22]).toEqual({ agentId: '22', name: 'Agent 22', answer: 'Answer from 22', status: 'done' })
  })

  it('marks the agents of a batch that throws as failed and keeps going', async () => {
    const ok = async (input: { interviews: Array<{ agentId: number | string }> }) => ({
      result: {
        results: Object.fromEntries(
          input.interviews.map((i) => [`reddit_${i.agentId}`, { agent_id: i.agentId, response: `A${i.agentId}` }]),
        ),
      },
    })
    const interviewBatch = vi
      .fn()
      .mockImplementationOnce(ok)
      .mockRejectedValueOnce(new MiroFishError({ code: 'timeout', message: 'slow', path: 'interview/batch' }))
      .mockImplementation(ok)
    const { deps, run, answers } = await withAgents(23, { simulation: { interviewBatch } })
    const next = await runDebrief(run, deps)
    expect(interviewBatch).toHaveBeenCalledTimes(3)
    expect(next.status).toBe('running')
    expect(answers().map((a) => a.status)).toEqual([
      ...Array(10).fill('done'),
      ...Array(10).fill('failed'),
      ...Array(3).fill('done'),
    ])
    expect(answers()[10]).toEqual({ agentId: '10', name: 'Agent 10', status: 'failed' })
  })

  it('stops sending batches once the run is cancelled', async () => {
    const ctx = await withAgents(23)
    const { deps, run, store } = ctx
    const real = deps.mirofish.simulation.interviewBatch
    const interviewBatch = vi.fn(async (...args: Parameters<typeof real>) => {
      const result = await real(...args)
      await store.update(run.id, { status: 'cancelled' })
      return result
    })
    await expect(
      runDebrief(run, {
        ...deps,
        mirofish: { ...deps.mirofish, simulation: { ...deps.mirofish.simulation, interviewBatch } },
      }),
    ).rejects.toBeInstanceOf(FenceError)
    expect(interviewBatch).toHaveBeenCalledTimes(1)
    expect(ctx.debriefs()).toEqual([])
  })

  it('throws instead of marking agents failed when the simulation id is missing', async () => {
    const { deps, run, store } = await withAgents(2)
    const broken = await store.update(run.id, { ids: {} })
    await expect(runDebrief({ ...broken, ids: {} }, deps)).rejects.toThrow('Missing simulationId')
    expect(deps.mirofish.simulation.interviewBatch).not.toHaveBeenCalled()
  })

  it('marks agents missing from the batch result as failed', async () => {
    const interviewBatch = vi.fn(async () => ({ result: { results: { reddit_0: { agent_id: 0, response: 'Yes' } } } }))
    const { deps, run, answers } = await withAgents(2, { simulation: { interviewBatch } })
    await runDebrief(run, deps)
    expect(answers()).toEqual([
      { agentId: '0', name: 'Agent 0', answer: 'Yes', status: 'done' },
      { agentId: '1', name: 'Agent 1', status: 'failed' },
    ])
  })

  it('asks in the configured language', async () => {
    const { deps, run } = await withAgents(1)
    await runDebrief(run, { ...deps, locale: 'de' })
    expect(vi.mocked(deps.mirofish.simulation.interviewBatch).mock.calls[0]?.[0].interviews[0]?.prompt).toBe(
      `${DEBRIEF_QUESTION}\n\nAntworte auf Deutsch.`,
    )
  })

  it('emits an empty debrief without calling MiroFish when there are no agents', async () => {
    const { deps, run, debriefs } = await withAgents(0)
    const next = await runDebrief(run, deps)
    expect(deps.mirofish.simulation.interviewBatch).not.toHaveBeenCalled()
    expect(debriefs().map((e) => e.payload)).toEqual([{ answers: [] }])
    expect(next.cursors.debriefDone).toBe(true)
  })
})
