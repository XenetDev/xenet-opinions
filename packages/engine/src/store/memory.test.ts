import { expect, it } from 'vitest'
import { ZodError } from 'zod'
import { createMemoryStore } from './memory'

const config = { requirement: 'r', maxRounds: 3, uploadIds: [] }
const input = (chatId: string, assistantMessageId = `a_${chatId}`) => ({ chatId, userId: 'u1', assistantMessageId, config })

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
  expect((await store.claimNext('b', 60000, 1))).toBeNull()
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
  const updated = await store.update(run.id, { ids: { graphId: 'g' }, cursors: { agentLogLine: 2 }, stage: 'graph_build' })
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

it('validates event payloads and missing runs', async () => {
  const store = createMemoryStore()
  const run = await store.create(input('c1'))
  await expect(store.appendEvent(run.id, { kind: 'report_text', partId: 'p', payload: { nope: 1 } })).rejects.toBeInstanceOf(ZodError)
  expect(await store.listEvents(run.id, 0)).toEqual([])
  await expect(store.appendEvent('missing', { kind: 'done', partId: null, payload: {} })).rejects.toThrow('run_not_found')
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
  const mk = (id: string) => ({ id, userId: 'u', chatId: 'c', storageKey: 'k', filename: 'f', mediaType: 't', sizeBytes: 1, createdAt: new Date() })
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
