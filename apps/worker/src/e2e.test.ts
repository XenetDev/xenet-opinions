import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb, schema } from '@xo/db'
import { type Deps, createDrizzleStore } from '@xo/engine'
import { createMiroFishClient } from '@xo/mirofish'
import { startMockMiroFish } from '@xo/mirofish/mock'
import { createLocalStorage, uploadKey } from '@xo/storage'
import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { runWorkerLoop } from './loop'

const TERMINAL = ['done', 'failed', 'cancelled']

type Ctx = {
  db: ReturnType<typeof createDb>
  store: ReturnType<typeof createDrizzleStore>
  mock: Awaited<ReturnType<typeof startMockMiroFish>>
  deps: Deps
  runId: string
  messageId: string
}

let cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn()
  cleanup = []
})

const fixture = async (): Promise<Ctx> => {
  const db = createDb(process.env.DATABASE_URL!)
  const store = createDrizzleStore(db)
  const mock = await startMockMiroFish({ port: 0, speed: 50 })
  const dir = await mkdtemp(join(tmpdir(), 'xo-worker-'))
  const storage = createLocalStorage(dir)
  const userId = `ur_${crypto.randomUUID()}`
  const chatId = `c_${userId}`
  const messageId = `a_${userId}`
  const uploadId = `up_${userId}`
  cleanup.push(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
    await mock.close()
    await rm(dir, { recursive: true, force: true })
  })
  const now = new Date()
  await db.insert(schema.user).values({ id: userId, name: 'anon', email: `${userId}@anon.local`, emailVerified: false, isAnonymous: true, createdAt: now, updatedAt: now })
  await db.insert(schema.chats).values({ id: chatId, userId })
  await db.insert(schema.messages).values([
    { id: `u_${userId}`, chatId, role: 'user', parts: [{ type: 'text', text: 'How will customers react?' }] },
    { id: messageId, chatId, role: 'assistant', parts: [] },
  ])
  const key = uploadKey(userId, uploadId, 'brief.txt')
  const body = new TextEncoder().encode('Price rises 20% next month for all subscribers.')
  await storage.put(key, body, 'text/plain')
  await db.insert(schema.uploads).values({ id: uploadId, userId, chatId, storageKey: key, filename: 'brief.txt', mediaType: 'text/plain', sizeBytes: body.length })
  const run = await store.create({ chatId, userId, assistantMessageId: messageId, config: { requirement: 'How will customers react?', maxRounds: 2, uploadIds: [uploadId] } })
  const deps: Deps = {
    store,
    mirofish: createMiroFishClient({ baseUrl: mock.url }),
    storage,
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: () => {},
  }
  return { db, store, mock, deps, runId: run.id, messageId }
}

const waitFor = async (check: () => Promise<boolean>, ms = 60_000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('waitFor timed out')
}

const opts = { owner: 'w1', leaseMs: 60_000, pollMs: 20, maxConcurrent: 1 }
const e2e = it.skipIf(!process.env.DATABASE_URL)

e2e('drives a queued run to done and materialises the report', { timeout: 90_000 }, async () => {
  const { db, store, deps, runId, messageId } = await fixture()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 60_000)
  const loop = runWorkerLoop({ ...deps, ...opts, signal: ac.signal })
  await waitFor(async () => TERMINAL.includes((await store.get(runId))!.status))
  ac.abort()
  await loop
  clearTimeout(timer)

  const run = (await store.get(runId))!
  expect(run.status).toBe('done')
  const events = await db.select().from(schema.runEvents).where(eq(schema.runEvents.runId, runId)).orderBy(asc(schema.runEvents.seq))
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1))
  expect(events.at(-1)?.kind).toBe('done')
  const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId))
  const text = (message!.parts as Array<{ type: string; text?: string }>).filter((p) => p.type === 'text').map((p) => p.text).join('\n')
  expect(text).toContain('Public Reaction to the 20% Price Increase')
})

e2e('does not restart a simulation after a worker restart', { timeout: 90_000 }, async () => {
  const { store, mock, deps, runId } = await fixture()
  const first = new AbortController()
  const loop1 = runWorkerLoop({ ...deps, ...opts, leaseMs: 100, signal: first.signal })
  await waitFor(async () => {
    const run = (await store.get(runId))!
    return run.stage === 'sim_run' && Boolean(run.cursors.simStarted)
  })
  first.abort()
  await loop1
  expect(mock.calls['POST /api/simulation/start']).toBe(1)
  expect(TERMINAL).not.toContain((await store.get(runId))!.status)

  const second = new AbortController()
  const loop2 = runWorkerLoop({ ...deps, ...opts, leaseMs: 100, signal: second.signal })
  await waitFor(async () => TERMINAL.includes((await store.get(runId))!.status))
  second.abort()
  await loop2
  expect((await store.get(runId))!.status).toBe('done')
  expect(mock.calls['POST /api/simulation/start']).toBe(1)
})
