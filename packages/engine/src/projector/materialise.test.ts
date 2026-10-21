import { describe, expect, it, vi } from 'vitest'
import type { RunEventInput } from '../events'
import { event } from '../orchestrator/emit'
import { fail } from '../orchestrator/machine'
import { drive, setupRun } from '../orchestrator/test-helpers'
import type { Deps } from '../orchestrator/types'
import { createMemoryStore } from '../store/memory'
import { materialiseRun } from './materialise'

const drivenEvents = async (): Promise<RunEventInput[]> => {
  const { store, deps, run } = await setupRun()
  const done = await drive(run, deps)
  expect(done.status).toBe('done')
  return (store.events.get(run.id) ?? []).map(({ kind, partId, payload }) => ({ kind: kind as RunEventInput['kind'], partId, payload }))
}

const setup = async (events: RunEventInput[]) => {
  const store = createMemoryStore()
  const run = await store.create({ chatId: 'c1', userId: 'u1', assistantMessageId: 'm1', config: { requirement: 'R', maxRounds: 2, uploadIds: [] } })
  for (const e of events) await store.appendEvent(run.id, e)
  return { store, run }
}

const count = (parts: { type: string }[], type: string) => parts.filter((p) => p.type === type).length

describe('materialiseRun', () => {
  it('materialises a full happy-path log', async () => {
    const { store, run } = await setup(await drivenEvents())
    const parts = await materialiseRun(store, run.id)
    const stages = parts.filter((p) => p.type === 'data-stage')
    expect(stages).toHaveLength(7)
    expect(stages.at(-1)).toMatchObject({ id: 'stage:finished', data: { stage: 'finished', status: 'done' } })
    for (const t of ['data-ontology', 'data-graph', 'data-agents', 'data-sim_feed', 'data-report_outline', 'data-sources']) expect(count(parts, t)).toBe(1)
    expect(count(parts, 'data-report_event')).toBe(5)
    expect(parts.filter((p) => p.type === 'text')).toEqual([expect.objectContaining({ type: 'text', text: '# Report' })])
    expect(parts.find((p) => p.type === 'data-agents')).toMatchObject({ data: { count: 2 } })
    expect(parts.find((p) => p.type === 'data-stage' && p.id === 'stage:graph_build')).toMatchObject({ data: { status: 'done' } })
    expect(store.parts.get('m1')).toEqual(parts)
  })

  it('is idempotent when replayed', async () => {
    const { store, run } = await setup(await drivenEvents())
    expect(await materialiseRun(store, run.id)).toEqual(await materialiseRun(store, run.id))
  })

  it('materialises a partial log without a terminal event', async () => {
    const { store, run } = await setup((await drivenEvents()).slice(0, 5))
    const parts = await materialiseRun(store, run.id)
    expect(count(parts, 'data-stage')).toBe(2)
    expect(count(parts, 'text')).toBe(0)
  })

  it('records the failed stage after fail', async () => {
    const { store, run } = await setup((await drivenEvents()).slice(0, 5))
    const deps = { store, now: () => new Date(), log: vi.fn() } as unknown as Deps
    await fail((await store.get(run.id))!, deps, 'graph_build', new Error('boom'))
    const parts = await materialiseRun(store, run.id)
    expect(parts.find((p) => p.type === 'data-stage' && p.id === 'stage:graph_build')).toMatchObject({
      data: { stage: 'graph_build', status: 'failed', message: 'boom' },
    })
    expect(count(parts, 'text')).toBe(0)
    expect(store.parts.get('m1')).toEqual(parts)
  })

  it('rejects a missing run', async () => {
    const { store } = await setup([])
    await expect(materialiseRun(store, 'nope')).rejects.toThrow('run_not_found')
  })

  it('records a cancelled report stage without report text', async () => {
    const events = (await drivenEvents()).filter((e) => !(e.kind === 'stage' && (e.payload as { stage: string }).stage === 'finished'))
    const cut = events.findIndex((e) => e.kind === 'report_text')
    const { store, run } = await setup([
      ...events.slice(0, cut),
      event('stage', { stage: 'report', status: 'cancelled', message: 'Cancelled by user' }),
      event('cancelled', { stage: 'report', message: 'Cancelled by user' }),
    ])
    const parts = await materialiseRun(store, run.id)
    expect(parts.find((p) => p.type === 'data-stage' && p.id === 'stage:report')).toMatchObject({ data: { stage: 'report', status: 'cancelled' } })
    expect(count(parts, 'text')).toBe(0)
  })
})
