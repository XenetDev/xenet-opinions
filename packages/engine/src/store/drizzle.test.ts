import { createDb, schema } from '@xo/db'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { ZodError } from 'zod'
import { createDrizzleStore } from './drizzle'

const config = { requirement: 'r', maxRounds: 3, uploadIds: [] }

async function withFixture(fn: (ctx: { db: ReturnType<typeof createDb>; store: ReturnType<typeof createDrizzleStore>; userId: string; mkChat: () => Promise<string> }) => Promise<void>) {
  const db = createDb(process.env.DATABASE_URL!)
  const store = createDrizzleStore(db)
  const userId = `ur_${crypto.randomUUID()}`
  await db.insert(schema.user).values({ id: userId, name: 'anon', email: `${userId}@anon.local`, emailVerified: false, isAnonymous: true, createdAt: new Date(), updatedAt: new Date() })
  const mkChat = async () => {
    const id = `c_${crypto.randomUUID()}`
    await db.insert(schema.chats).values({ id, userId })
    return id
  }
  try {
    await fn({ db, store, userId, mkChat })
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  }
}

const run = it.skipIf(!process.env.DATABASE_URL)

run('creates, reads, and finds active/latest runs', () =>
  withFixture(async ({ store, userId, mkChat }) => {
    const chatId = await mkChat()
    const created = await store.create({ chatId, userId, assistantMessageId: 'a1', config })
    expect(created.status).toBe('queued')
    expect(created.stage).toBe('ontology')
    expect((await store.get(created.id))?.id).toBe(created.id)
    expect(await store.get('missing')).toBeNull()
    expect((await store.getActiveByChat(chatId))?.id).toBe(created.id)
    await store.update(created.id, { status: 'done' })
    expect(await store.getActiveByChat(chatId)).toBeNull()
    expect((await store.getLatestByChat(chatId))?.id).toBe(created.id)
    const second = await store.create({ chatId, userId, assistantMessageId: 'a2', config })
    expect((await store.getLatestByChat(chatId))?.id).toBe(second.id)
  }),
)

run('update merges ids and cursors shallowly', () =>
  withFixture(async ({ store, userId, mkChat }) => {
    const created = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    await store.update(created.id, { ids: { projectId: 'p' } })
    const updated = await store.update(created.id, { ids: { graphId: 'g' }, cursors: { agentLogLine: 2 }, stage: 'graph_build' })
    expect(updated.ids).toEqual({ projectId: 'p', graphId: 'g' })
    expect(updated.cursors).toEqual({ agentLogLine: 2 })
    expect(updated.stage).toBe('graph_build')
  }),
)

async function assertNoForeignActive(db: ReturnType<typeof createDb>, userId: string) {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(inArray(schema.runs.status, ['queued', 'running']), ne(schema.runs.userId, userId)))
    .limit(1)
  if (rows.length > 0) throw new Error('dev DB has active runs; clean them before running claim tests')
}

run('claims queued runs once under concurrency', () =>
  withFixture(async ({ db, store, userId, mkChat }) => {
    await assertNoForeignActive(db, userId)
    const created = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    const results = await Promise.all([store.claimNext('a', 60000, 1000), store.claimNext('b', 60000, 1000)])
    const winners = results.filter((r) => r !== null)
    expect(winners).toHaveLength(1)
    expect(winners[0]!.id).toBe(created.id)
    expect(winners[0]!.status).toBe('running')
    expect(winners[0]!.attempt).toBe(1)
    expect(winners[0]!.startedAt).toBeInstanceOf(Date)
    expect(['a', 'b']).toContain(winners[0]!.leaseOwner)
  }),
)

run('simultaneous claims never exceed maxConcurrent', () =>
  withFixture(async ({ db, store, userId, mkChat }) => {
    await assertNoForeignActive(db, userId)
    await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a2', config })
    const results = await Promise.all([store.claimNext('a', 60000, 1), store.claimNext('b', 60000, 1)])
    expect(results.filter((r) => r !== null)).toHaveLength(1)
  }),
)

run('respects maxConcurrent and reclaims expired leases', () =>
  withFixture(async ({ db, store, userId, mkChat }) => {
    await assertNoForeignActive(db, userId)
    const first = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    expect((await store.claimNext('a', 60000, 1))?.id).toBe(first.id)
    const second = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a2', config })
    expect(await store.claimNext('b', 60000, 1)).toBeNull()
    expect((await store.get(second.id))?.status).toBe('queued')
    await db.update(schema.runs).set({ leaseUntil: new Date(Date.now() - 5000) }).where(eq(schema.runs.id, first.id))
    const reclaimed = await store.claimNext('b', 60000, 1)
    expect(reclaimed?.id).toBe(first.id)
    expect(reclaimed?.attempt).toBe(2)
    expect(reclaimed?.leaseOwner).toBe('b')
  }),
)

run('renewLease requires owner and running status', () =>
  withFixture(async ({ db, store, userId, mkChat }) => {
    const created = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    expect(await store.renewLease(created.id, 'a', 1000)).toBe(false)
    await db.update(schema.runs).set({ status: 'running', leaseOwner: 'a', leaseUntil: new Date(Date.now() + 1000) }).where(eq(schema.runs.id, created.id))
    expect(await store.renewLease(created.id, 'b', 60000)).toBe(false)
    expect(await store.renewLease(created.id, 'a', 60000)).toBe(true)
    expect((await store.get(created.id))!.leaseUntil!.getTime()).toBeGreaterThan(Date.now() + 30000)
    await store.update(created.id, { status: 'done' })
    expect(await store.renewLease(created.id, 'a', 60000)).toBe(false)
  }),
)

run('appends events with sequential seq and lists after a cursor', () =>
  withFixture(async ({ store, userId, mkChat }) => {
    const created = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    const appended = await Promise.all([
      store.appendEvent(created.id, { kind: 'done', partId: null, payload: {} }),
      store.appendEvent(created.id, { kind: 'report_text', partId: 'p', payload: { markdown: 'x' } }),
      store.appendEvent(created.id, { kind: 'done', partId: null, payload: {} }),
    ])
    expect(appended.map((e) => e.seq).sort()).toEqual([1, 2, 3])
    expect((await store.listEvents(created.id, 0)).map((e) => e.seq)).toEqual([1, 2, 3])
    expect((await store.listEvents(created.id, 2)).map((e) => e.seq)).toEqual([3])
    await expect(store.appendEvent(created.id, { kind: 'report_text', partId: 'p', payload: { nope: 1 } })).rejects.toBeInstanceOf(ZodError)
    await expect(store.appendEvent('missing', { kind: 'done', partId: null, payload: {} })).rejects.toThrow('run_not_found')
  }),
)

run('transition appends events and applies the patch in one transaction', () =>
  withFixture(async ({ store, userId, mkChat }) => {
    const created = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    await store.appendEvent(created.id, { kind: 'report_text', partId: 'p', payload: { markdown: 'x' } })
    await store.update(created.id, { cursors: { retries: 2 } })
    const finishedAt = new Date('2026-10-20T12:00:00Z')
    const done = await store.transition(created.id, { status: 'done', finishedAt, envState: 'open', cursors: { agentLogLine: 4 } }, [
      { kind: 'stage', partId: 'stage:finished', payload: { stage: 'finished', status: 'done' } },
      { kind: 'done', partId: null, payload: {} },
    ])
    expect(done).toMatchObject({ status: 'done', finishedAt, envState: 'open', cursors: { retries: 2, agentLogLine: 4 } })
    expect((await store.get(created.id))?.status).toBe('done')
    expect((await store.listEvents(created.id, 0)).map((e) => [e.seq, e.kind, e.partId])).toEqual([
      [1, 'report_text', 'p'],
      [2, 'stage', 'stage:finished'],
      [3, 'done', null],
    ])
  }),
)

run('transition applies nothing when a payload is invalid', () =>
  withFixture(async ({ store, userId, mkChat }) => {
    const created = await store.create({ chatId: await mkChat(), userId, assistantMessageId: 'a1', config })
    await expect(
      store.transition(created.id, { status: 'failed' }, [
        { kind: 'done', partId: null, payload: {} },
        { kind: 'report_text', partId: 'p', payload: { nope: 1 } },
      ]),
    ).rejects.toBeInstanceOf(ZodError)
    expect((await store.get(created.id))?.status).toBe('queued')
    expect(await store.listEvents(created.id, 0)).toEqual([])
    await expect(store.transition('missing', { status: 'done' }, [])).rejects.toThrow('run_not_found')
  }),
)

run('sets message parts and lists uploads in id order', () =>
  withFixture(async ({ db, store, userId, mkChat }) => {
    const chatId = await mkChat()
    const messageId = `m_${crypto.randomUUID()}`
    await db.insert(schema.messages).values({ id: messageId, chatId, role: 'assistant', parts: [] })
    await store.setMessageParts(messageId, [{ type: 'text', text: 'hi' }])
    const [row] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId))
    expect(row!.parts).toEqual([{ type: 'text', text: 'hi' }])
    const ids = [`up1_${userId}`, `up2_${userId}`]
    for (const id of ids) await db.insert(schema.uploads).values({ id, userId, chatId, storageKey: 'k', filename: 'f', mediaType: 't', sizeBytes: 1 })
    expect((await store.listUploads([ids[1]!, ids[0]!, 'nope'])).map((u) => u.id)).toEqual([ids[1], ids[0]])
    expect(await store.listUploads([])).toEqual([])
  }),
)
