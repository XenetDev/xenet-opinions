import { describe, expect, it } from 'vitest'
import type { StageData } from '../parts'
import { cancelRun } from './cancel'
import { NOW, setupRun } from './test-helpers'

describe('cancelRun', () => {
  it('cancels a running run and releases the lease', async () => {
    const { store, run } = await setupRun()
    await store.update(run.id, { status: 'running', stage: 'sim_run', leaseUntil: new Date(NOW.getTime() + 60_000) })
    const cancelled = await cancelRun(store, run.id, NOW)
    expect(cancelled).toMatchObject({ status: 'cancelled', finishedAt: NOW, error: null })
    expect(cancelled.leaseUntil!.getTime()).toBeLessThanOrEqual(NOW.getTime())
    const events = await store.listEvents(run.id, 0)
    expect(
      events
        .map((e) =>
          e.kind === 'stage' ? `stage:${(e.payload as StageData).stage}:${(e.payload as StageData).status}` : e.kind,
        )
        .slice(-2),
    ).toEqual(['stage:sim_run:cancelled', 'cancelled'])
  })

  it('marks an open environment closed when cancelling a paused run', async () => {
    const { store, run } = await setupRun()
    await store.update(run.id, {
      stage: 'interviews',
      envState: 'open',
      envKeepaliveUntil: new Date(NOW.getTime() + 60_000),
    })
    await store.createInterviews([
      {
        id: 'iv_1',
        chatId: 'c1',
        runId: run.id,
        messageId: 'm1',
        agentId: '0',
        agentName: 'Maya',
        question: 'Q?',
        status: 'pending',
        questionId: 'q1',
      },
    ])
    const cancelled = await cancelRun(store, run.id, NOW)
    expect(cancelled).toMatchObject({ status: 'cancelled', envState: 'closed', envKeepaliveUntil: null })
    expect(store.interviews.get('iv_1')?.status).toBe('failed')
    const events = await store.listEvents(run.id, 0)
    expect(events.map((e) => e.kind)).toEqual(['interview', 'stage', 'cancelled'])
    expect(events[0]).toMatchObject({
      partId: 'interview:iv_1',
      payload: { id: 'iv_1', questionId: 'q1', status: 'failed', error: 'Agents are offline' },
    })
  })

  it('cancels a queued run', async () => {
    const { store } = await setupRun()
    const queued = await store.create({
      chatId: 'c2',
      userId: 'u1',
      assistantMessageId: 'm2',
      config: { requirement: 'r', maxRounds: 2, uploadIds: [] },
    })
    const cancelled = await cancelRun(store, queued.id, NOW)
    expect(cancelled).toMatchObject({ status: 'cancelled', finishedAt: NOW })
    expect((await store.listEvents(queued.id, 0)).map((e) => e.kind)).toEqual(['stage', 'cancelled'])
  })

  it('rejects inside the transition when the run finished after it was read', async () => {
    const { store, run } = await setupRun()
    const get = store.get.bind(store)
    store.get = async (id) => {
      const read = await get(id)
      await store.update(id, { status: 'done' })
      return read
    }
    await expect(cancelRun(store, run.id, NOW)).rejects.toThrow('run_not_active')
    expect((await get(run.id))?.status).toBe('done')
    expect(await store.listEvents(run.id, 0)).toEqual([])
  })

  it('rejects a run that is not active', async () => {
    const { store, run } = await setupRun()
    await store.update(run.id, { status: 'done' })
    await expect(cancelRun(store, run.id, NOW)).rejects.toThrow('run_not_active')
  })

  it('rejects a missing run', async () => {
    const { store } = await setupRun()
    await expect(cancelRun(store, 'nope', NOW)).rejects.toThrow('run_not_found')
  })
})
