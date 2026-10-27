import { expect, it } from 'vitest'
import { ZodError } from 'zod'
import { cancelRun } from '../orchestrator/cancel'
import { createMemoryStore } from './memory'
import { FenceError } from './types'

const config = { requirement: 'r', maxRounds: 3, uploadIds: [] }
const input = (chatId: string, assistantMessageId = `a_${chatId}`) => ({
  chatId,
  userId: 'u1',
  assistantMessageId,
  config,
})

it('creates and reads runs', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  expect(run.status).toBe('queued')
  expect(run.stage).toBe('ontology')
  expect(run.attempt).toBe(0)
  expect(await store.get(run.id)).toEqual(run)
  expect(await store.get('missing')).toBeNull()
  expect((await store.getActiveByChat('c1'))?.id).toBe(run.id)
  expect((await store.getLatestByChat('c1'))?.id).toBe(run.id)
  await store.update(run.id, { status: 'done' })
  expect(await store.getActiveByChat('c1')).toBeNull()
  expect((await store.getLatestByChat('c1'))?.id).toBe(run.id)
})

it('rejects a second active run for a chat', async () => {
  const store = createMemoryStore()
  await store.create(input('c1'))
  await expect(store.create(input('c1', 'a2'))).rejects.toThrow()
})

it('claims the oldest queued run and respects maxConcurrent', async () => {
  const store = createMemoryStore()
  const r1 = await store.create(input('c1'))
  const r2 = await store.create(input('c2'))
  const claimed = await store.claimNext('a', 60000, 2)
  expect(claimed?.id).toBe(r1.id)
  expect(claimed?.status).toBe('running')
  expect(claimed?.leaseOwner).toBe('a')
  expect(claimed?.attempt).toBe(1)
  expect(claimed?.startedAt).toBeInstanceOf(Date)
  expect(await store.claimNext('b', 60000, 1)).toBeNull()
  expect((await store.claimNext('b', 60000, 2))?.id).toBe(r2.id)
  expect(await store.claimNext('c', 60000, 5)).toBeNull()
})

it('concurrent claims on one queued run yield exactly one winner', async () => {
  const store = createMemoryStore()
  await store.create(input('c1'))
  const results = await Promise.all([store.claimNext('a', 60000, 1), store.claimNext('b', 60000, 1)])
  expect(results.filter((r) => r !== null)).toHaveLength(1)
})

it('reclaims an expired lease and increments attempt', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.claimNext('a', 60000, 1)
  store.runs.set(run.id, { ...store.runs.get(run.id)!, leaseUntil: new Date(Date.now() - 1000) })
  const again = await store.claimNext('b', 60000, 1)
  expect(again?.id).toBe(run.id)
  expect(again?.leaseOwner).toBe('b')
  expect(again?.attempt).toBe(2)
})

it('renewLease requires owner and running status', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  expect(await store.renewLease(run.id, 'a', 1000)).toBe(false)
  await store.claimNext('a', 1000, 1)
  expect(await store.renewLease(run.id, 'b', 60000)).toBe(false)
  expect(await store.renewLease(run.id, 'a', 60000)).toBe(true)
  expect((await store.get(run.id))!.leaseUntil!.getTime()).toBeGreaterThan(Date.now() + 30000)
  await store.update(run.id, { status: 'done' })
  expect(await store.renewLease(run.id, 'a', 60000)).toBe(false)
})

it('update merges ids and cursors shallowly', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.update(run.id, { ids: { projectId: 'p' } })
  const updated = await store.update(run.id, {
    ids: { graphId: 'g' },
    cursors: { agentLogLine: 2 },
    stage: 'graph_build',
  })
  expect(updated.ids).toEqual({ projectId: 'p', graphId: 'g' })
  expect(updated.cursors).toEqual({ agentLogLine: 2 })
  expect(updated.stage).toBe('graph_build')
})

it('appends events with sequential seq and lists after a cursor', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  const e1 = await store.appendEvent(run.id, { kind: 'done', partId: null, payload: {} })
  const e2 = await store.appendEvent(run.id, { kind: 'report_text', partId: 'p', payload: { markdown: 'x' } })
  const e3 = await store.appendEvent(run.id, { kind: 'done', partId: null, payload: {} })
  expect([e1.seq, e2.seq, e3.seq]).toEqual([1, 2, 3])
  expect((await store.listEvents(run.id, 0)).map((e) => e.seq)).toEqual([1, 2, 3])
  expect((await store.listEvents(run.id, 2)).map((e) => e.seq)).toEqual([3])
  expect(await store.listEvents('missing', 0)).toEqual([])
})

it('reports the last event seq, 0 when empty', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  expect(await store.lastSeq(run.id)).toBe(0)
  await store.appendEvent(run.id, { kind: 'report_text', partId: 'p', payload: { markdown: 'x' } })
  await store.appendEvent(run.id, { kind: 'done', partId: null, payload: {} })
  expect(await store.lastSeq(run.id)).toBe(2)
  expect(await store.lastSeq('missing')).toBe(0)
})

it('validates event payloads and missing runs', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await expect(
    store.appendEvent(run.id, { kind: 'report_text', partId: 'p', payload: { nope: 1 } }),
  ).rejects.toBeInstanceOf(ZodError)
  expect(await store.listEvents(run.id, 0)).toEqual([])
  await expect(store.appendEvent('missing', { kind: 'done', partId: null, payload: {} })).rejects.toThrow(
    'run_not_found',
  )
})

it('transition appends events and applies the patch together', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.appendEvent(run.id, { kind: 'report_text', partId: 'p', payload: { markdown: 'x' } })
  const finishedAt = new Date('2026-10-20T12:00:00Z')
  const done = await store.transition(run.id, { status: 'done', finishedAt, cursors: { retries: 0 } }, [
    { kind: 'stage', partId: 'stage:finished', payload: { stage: 'finished', status: 'done' } },
    { kind: 'done', partId: null, payload: {} },
  ])
  expect(done).toMatchObject({ status: 'done', finishedAt, cursors: { retries: 0 } })
  expect(await store.get(run.id)).toEqual(done)
  expect((await store.listEvents(run.id, 0)).map((e) => [e.seq, e.kind])).toEqual([
    [1, 'report_text'],
    [2, 'stage'],
    [3, 'done'],
  ])
})

it('transition applies nothing when a payload is invalid', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await expect(
    store.transition(run.id, { status: 'failed' }, [
      { kind: 'done', partId: null, payload: {} },
      { kind: 'report_text', partId: 'p', payload: { nope: 1 } },
    ]),
  ).rejects.toBeInstanceOf(ZodError)
  expect((await store.get(run.id))?.status).toBe('queued')
  expect(await store.listEvents(run.id, 0)).toEqual([])
  await expect(store.transition('missing', { status: 'done' }, [])).rejects.toThrow('run_not_found')
})

it('stores message parts and lists uploads in id order', async () => {
  const store = createMemoryStore()
  await store.setMessageParts('m1', [{ type: 'text', text: 'hi' }])
  expect(store.parts.get('m1')).toEqual([{ type: 'text', text: 'hi' }])
  const mk = (id: string) => ({
    id,
    userId: 'u',
    chatId: 'c',
    storageKey: 'k',
    filename: 'f',
    mediaType: 't',
    sizeBytes: 1,
    createdAt: new Date(),
  })
  store.uploads.set('u1', mk('u1'))
  store.uploads.set('u2', mk('u2'))
  expect((await store.listUploads(['u2', 'u1', 'nope'])).map((u) => u.id)).toEqual(['u2', 'u1'])
})

it('getLatestByChat returns the most recent run on same-ms ties', async () => {
  const store = createMemoryStore()
  const first = await store.create(input('c1'))
  await store.update(first.id, { status: 'done' })
  const second = await store.create(input('c1', 'a2'))
  expect((await store.getLatestByChat('c1'))?.id).toBe(second.id)
})

const stageDone = {
  kind: 'stage' as const,
  partId: 'stage:finished',
  payload: { stage: 'finished' as const, status: 'done' as const },
}

it('fenced update by the wrong owner throws and changes nothing', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.claimNext('a', 60000, 1)
  const before = await store.get(run.id)
  const err = await store
    .update(run.id, { stage: 'graph_build', ids: { projectId: 'p' } }, { owner: 'b' })
    .catch((e) => e)
  expect(err).toBeInstanceOf(FenceError)
  expect(err).toMatchObject({ name: 'FenceError', code: 'run_fenced' })
  expect(await store.get(run.id)).toEqual(before)
  expect((await store.update(run.id, { stage: 'graph_build' }, { owner: 'a' })).stage).toBe('graph_build')
})

it('fenced transition by the right owner applies events and patch', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.claimNext('a', 60000, 1)
  const done = await store.transition(
    run.id,
    { status: 'done' },
    [stageDone, { kind: 'done', partId: null, payload: {} }],
    { owner: 'a' },
  )
  expect(done.status).toBe('done')
  expect((await store.listEvents(run.id, 0)).map((e) => e.kind)).toEqual(['stage', 'done'])
})

it('fenced transition after cancelRun throws and leaves the run cancelled', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.claimNext('a', 60000, 1)
  await cancelRun(store, run.id, new Date())
  await expect(
    store.transition(run.id, { status: 'done' }, [stageDone, { kind: 'done', partId: null, payload: {} }], {
      owner: 'a',
    }),
  ).rejects.toBeInstanceOf(FenceError)
  expect((await store.get(run.id))?.status).toBe('cancelled')
  expect((await store.listEvents(run.id, 0)).at(-1)?.kind).toBe('cancelled')
})

it('fenced appendEvent by the wrong owner throws and appends nothing', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.claimNext('a', 60000, 1)
  await expect(
    store.appendEvent(run.id, { kind: 'done', partId: null, payload: {} }, { owner: 'b' }),
  ).rejects.toBeInstanceOf(FenceError)
  expect(await store.listEvents(run.id, 0)).toEqual([])
  expect((await store.appendEvent(run.id, { kind: 'done', partId: null, payload: {} }, { owner: 'a' })).seq).toBe(1)
})

it('unfenced writes ignore lease ownership', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.claimNext('a', 60000, 1)
  await store.update(run.id, { status: 'done' })
  expect((await store.update(run.id, { stage: 'report' })).stage).toBe('report')
  expect((await store.appendEvent(run.id, { kind: 'done', partId: null, payload: {} })).seq).toBe(1)
  expect((await store.transition(run.id, { status: 'failed' }, [])).status).toBe('failed')
})

it('releaseLease expires the owner lease so the run is reclaimable', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  expect(await store.releaseLease(run.id, 'a')).toBe(false)
  await store.claimNext('a', 60000, 1)
  expect(await store.releaseLease(run.id, 'b')).toBe(false)
  expect(await store.claimNext('b', 60000, 1)).toBeNull()
  expect(await store.releaseLease(run.id, 'a')).toBe(true)
  const reclaimed = await store.claimNext('b', 60000, 1)
  expect(reclaimed?.id).toBe(run.id)
  expect(reclaimed?.leaseOwner).toBe('b')
  await store.update(run.id, { status: 'done' })
  expect(await store.releaseLease(run.id, 'b')).toBe(false)
})

it('transition with expectStatus rejects a mismatched run and writes nothing', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await store.update(run.id, { status: 'done' })
  await expect(
    store.transition(run.id, { status: 'cancelled' }, [{ kind: 'done', partId: null, payload: {} }], undefined, {
      expectStatus: ['queued', 'running'],
    }),
  ).rejects.toThrow('run_not_active')
  expect((await store.get(run.id))?.status).toBe('done')
  expect(await store.listEvents(run.id, 0)).toEqual([])
})

it('fenced writes to a missing run throw FenceError; unfenced throw run_not_found', async () => {
  const store = createMemoryStore()
  await expect(store.update('missing', { stage: 'report' }, { owner: 'a' })).rejects.toBeInstanceOf(FenceError)
  await expect(store.transition('missing', { status: 'done' }, [], { owner: 'a' })).rejects.toBeInstanceOf(FenceError)
  await expect(
    store.appendEvent('missing', { kind: 'done', partId: null, payload: {} }, { owner: 'a' }),
  ).rejects.toBeInstanceOf(FenceError)
  await expect(store.update('missing', { stage: 'report' })).rejects.toThrow('run_not_found')
})

it('lists open environments past their deadline, oldest first, limited', async () => {
  const store = createMemoryStore()
  const mk = async (chatId: string, patch: Parameters<typeof store.update>[1]) => {
    const r = await store.create(input(chatId))
    return store.update(r.id, patch)
  }
  const t = (m: number) => new Date(Date.UTC(2026, 9, 21, 12, m))
  const late = await mk('c1', { status: 'done', envState: 'open', envKeepaliveUntil: t(5) })
  const early = await mk('c2', { status: 'done', envState: 'open', envKeepaliveUntil: t(1) })
  await mk('c3', { status: 'done', envState: 'open', envKeepaliveUntil: t(30) })
  await mk('c4', { status: 'done', envState: 'closed', envKeepaliveUntil: t(0) })
  await mk('c5', { status: 'done', envState: 'open', envKeepaliveUntil: null })
  await mk('c6', { status: 'running', envState: 'open', envKeepaliveUntil: t(0) })
  expect((await store.listEnvsToSweep(t(10))).map((r) => r.id)).toEqual([early.id, late.id])
  expect((await store.listEnvsToSweep(t(10), 1)).map((r) => r.id)).toEqual([early.id])
  expect((await store.listEnvsToSweep(t(5))).map((r) => r.id)).toEqual([early.id, late.id])
})

it('closeEnv closes an open environment once and reports whether it won', async () => {
  const store = createMemoryStore()
  const open = await store.update((await store.create(input('c1'))).id, { status: 'done', envState: 'open' })
  const none = await store.create(input('c2'))
  expect(await store.closeEnv(open.id)).toBe(true)
  expect((await store.get(open.id))?.envState).toBe('closed')
  expect(await store.closeEnv(open.id)).toBe(false)
  expect(await store.closeEnv(none.id)).toBe(false)
  expect((await store.get(none.id))?.envState).toBe(none.envState)
  expect(await store.closeEnv('missing')).toBe(false)
})

it('reports queue positions for queued runs only', async () => {
  const store = createMemoryStore()
  const [r0, r1, r2] = [
    await store.create(input('c1')),
    await store.create(input('c2')),
    await store.create(input('c3')),
  ]
  const at = (id: string, ms: number) => store.runs.set(id, { ...store.runs.get(id)!, queuedAt: new Date(ms) })
  at(r0!.id, 1000)
  at(r1!.id, 2000)
  at(r2!.id, 3000)
  store.runs.set(r0!.id, { ...store.runs.get(r0!.id)!, status: 'running' })
  expect(await store.queuePosition(r0!.id)).toBeNull()
  expect(await store.queuePosition(r1!.id)).toBe(2)
  expect(await store.queuePosition(r2!.id)).toBe(3)
  expect(await store.queuePosition('missing')).toBeNull()
  await store.update(r0!.id, { status: 'done' })
  await store.claimNext('a', 60000, 2)
  expect(store.runs.get(r1!.id)!.status).toBe('running')
  expect(await store.queuePosition(r1!.id)).toBeNull()
  expect(await store.queuePosition(r2!.id)).toBe(2)
})

it('gives runs with identical queuedAt the same position', async () => {
  const store = createMemoryStore()
  const [r0, r1, r2] = [
    await store.create(input('c1')),
    await store.create(input('c2')),
    await store.create(input('c3')),
  ]
  const same = new Date(5000)
  for (const r of [r0!, r1!, r2!]) store.runs.set(r.id, { ...store.runs.get(r.id)!, queuedAt: same })
  expect(await store.queuePosition(r0!.id)).toBe(1)
  expect(await store.queuePosition(r1!.id)).toBe(1)
  expect(await store.queuePosition(r2!.id)).toBe(1)
})

it('creates, lists pending in order, and updates interviews', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  const t = (s: number) => new Date(Date.UTC(2026, 9, 27, 12, 0, s))
  const row = (id: string, createdAt: Date, runId = run.id) => ({
    id,
    chatId: 'c1',
    runId,
    messageId: 'm1',
    agentId: '0',
    agentName: 'Maya',
    question: 'Q?',
    status: 'pending',
    questionId: 'q1',
    createdAt,
  })
  const created = await store.createInterviews([row('b', t(1)), row('a', t(1)), row('c', t(0)), row('x', t(0), 'r2')])
  expect(created.map((r) => r.id)).toEqual(['b', 'a', 'c', 'x'])
  expect(created[0]).toMatchObject({ answer: null, questionId: 'q1' })
  expect((await store.listPendingInterviews(run.id)).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  await store.updateInterview('a', { status: 'done', answer: 'Yes' })
  await store.updateInterview('c', { status: 'failed' })
  expect((await store.listPendingInterviews(run.id)).map((r) => r.id)).toEqual(['b'])
  expect(store.interviews.get('a')).toMatchObject({ status: 'done', answer: 'Yes' })
  expect(store.interviews.get('c')).toMatchObject({ status: 'failed', answer: null })
  expect(await store.createInterviews([])).toEqual([])
})

it('reports whether any running run is paused for interviews', async () => {
  const store = createMemoryStore()
  const r0 = await store.create(input('c1'))
  expect(await store.hasPausedRunning()).toBe(false)
  await store.update(r0.id, { status: 'running', stage: 'sim_run' })
  expect(await store.hasPausedRunning()).toBe(false)
  await store.update(r0.id, { stage: 'interviews' })
  expect(await store.hasPausedRunning()).toBe(true)
  await store.update(r0.id, { status: 'done' })
  expect(await store.hasPausedRunning()).toBe(false)
})

it('transition with expect guards on the locked row and can patch from it', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  const stage = { kind: 'stage', partId: 'stage:ontology', payload: { stage: 'ontology', status: 'running' } } as const
  await expect(
    store.transition(run.id, { status: 'done' }, [stage], undefined, { expect: () => false }),
  ).rejects.toThrow('run_not_active')
  expect((await store.get(run.id))?.status).toBe('queued')
  expect(await store.lastSeq(run.id)).toBe(0)
  const seen: string[] = []
  const next = await store.transition(
    run.id,
    (locked) => ({ cursors: { lastAgentCount: locked.attempt + 7 } }),
    [stage],
    undefined,
    {
      expect: (locked) => {
        seen.push(locked.id)
        return locked.status === 'queued'
      },
    },
  )
  expect(seen).toEqual([run.id])
  expect(next.cursors.lastAgentCount).toBe(7)
  expect(await store.lastSeq(run.id)).toBe(1)
})
