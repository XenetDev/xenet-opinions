import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb, schema } from '@xo/db'
import { cancelRun, createDrizzleStore, type Deps } from '@xo/engine'
import { createMiroFishClient } from '@xo/mirofish'
import { startMockMiroFish } from '@xo/mirofish/mock'
import { createLocalStorage, uploadKey } from '@xo/storage'
import { asc, eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
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

type FixtureOpts = { pause?: boolean; mock?: Parameters<typeof startMockMiroFish>[0] }

const fixture = async (fx: FixtureOpts = {}): Promise<Ctx> => {
  const db = createDb(process.env.DATABASE_URL!)
  const store = createDrizzleStore(db)
  const mock = await startMockMiroFish({ port: 0, speed: 50, ...fx.mock })
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
  await db.insert(schema.user).values({
    id: userId,
    name: 'anon',
    email: `${userId}@anon.local`,
    emailVerified: false,
    isAnonymous: true,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.chats).values({ id: chatId, userId })
  await db.insert(schema.messages).values([
    { id: `u_${userId}`, chatId, role: 'user', parts: [{ type: 'text', text: 'How will customers react?' }] },
    { id: messageId, chatId, role: 'assistant', parts: [] },
  ])
  const key = uploadKey(userId, uploadId, 'brief.txt')
  const body = new TextEncoder().encode('Price rises 20% next month for all subscribers.')
  await storage.put(key, body, 'text/plain')
  await db.insert(schema.uploads).values({
    id: uploadId,
    userId,
    chatId,
    storageKey: key,
    filename: 'brief.txt',
    mediaType: 'text/plain',
    sizeBytes: body.length,
  })
  const run = await store.create({
    chatId,
    userId,
    assistantMessageId: messageId,
    config: {
      requirement: 'How will customers react?',
      maxRounds: 2,
      uploadIds: [uploadId],
      ...(fx.pause ? { pauseForInterviews: true } : {}),
    },
  })
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

const opts = { owner: 'w1', leaseMs: 60_000, pollMs: 20, maxConcurrent: 1, sweepIntervalMs: 0 }
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
  const events = await db
    .select()
    .from(schema.runEvents)
    .where(eq(schema.runEvents.runId, runId))
    .orderBy(asc(schema.runEvents.seq))
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1))
  expect(events.at(-1)?.kind).toBe('done')
  const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId))
  const text = (message!.parts as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
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

e2e('stops the simulation and ends cancelled when cancelled during sim_run', { timeout: 30_000 }, async () => {
  const { store, mock, deps, runId } = await fixture()
  const ac = new AbortController()
  const loop = runWorkerLoop({ ...deps, ...opts, signal: ac.signal })
  await waitFor(async () => {
    const run = (await store.get(runId))!
    return run.stage === 'sim_run' && Boolean(run.cursors.startAcked)
  })
  await cancelRun(store, runId, new Date())
  await waitFor(async () => mock.calls['POST /api/simulation/stop'] === 1, 10_000)
  await new Promise((r) => setTimeout(r, 200))
  ac.abort()
  await loop
  const run = (await store.get(runId))!
  expect(run.status).toBe('cancelled')
  expect(mock.calls['POST /api/simulation/stop']).toBe(1)
  expect((await store.listEvents(runId, 0)).at(-1)?.kind).toBe('cancelled')
})

e2e('finishes with the environment closed and still sweeps a legacy open one', { timeout: 90_000 }, async () => {
  const { store, mock, deps, runId } = await fixture()
  const ac = new AbortController()
  const loop = runWorkerLoop({ ...deps, ...opts, sweepIntervalMs: 50, signal: ac.signal })
  await waitFor(async () => (await store.get(runId))!.status === 'done')
  const done = (await store.get(runId))!
  expect(done.envState).toBe('closed')
  expect(done.envKeepaliveUntil).toBeNull()
  expect(mock.calls['POST /api/simulation/close-env']).toBe(1)
  await store.update(runId, { envState: 'open', envKeepaliveUntil: new Date(Date.now() - 1000) })
  await waitFor(async () => (await store.get(runId))!.envState === 'closed', 10_000)
  await new Promise((r) => setTimeout(r, 200))
  ac.abort()
  await loop
  expect(mock.calls['POST /api/simulation/close-env']).toBe(2)
})

e2e(
  'pauses for interviews, answers two personas, then closes and reports on request',
  { timeout: 90_000 },
  async () => {
    const { db, store, mock, deps, runId, messageId } = await fixture({ pause: true, mock: { interviewDelayMs: 0 } })
    const ac = new AbortController()
    const loop = runWorkerLoop({ ...deps, ...opts, signal: ac.signal })
    const kinds = async (kind: string) => (await store.listEvents(runId, 0)).filter((e) => e.kind === kind)
    const windows = async () =>
      (await kinds('interview_window')).map((e) => e.payload as { closed: boolean; reason?: string })

    await waitFor(async () => {
      const run = (await store.get(runId))!
      return run.stage === 'interviews' && run.envState === 'open' && (await windows()).some((w) => !w.closed)
    })
    expect(mock.calls['POST /api/simulation/close-env'] ?? 0).toBe(0)

    const roster = (await kinds('agents')).at(-1)!.payload as { profiles: Array<{ id: string; name: string }> }
    const [a, b] = roster.profiles
    const run = (await store.get(runId))!
    const questionId = `q_${crypto.randomUUID()}`
    await store.createInterviews(
      [a!, b!].map((p) => ({
        id: `iv_${crypto.randomUUID()}`,
        chatId: run.chatId,
        runId,
        messageId,
        questionId,
        agentId: p.id,
        agentName: p.name,
        question: 'What worries you most?',
        status: 'pending',
      })),
    )
    await waitFor(async () => {
      const rows = await db.select().from(schema.interviews).where(eq(schema.interviews.runId, runId))
      return rows.length === 2 && rows.every((r) => r.status === 'done')
    })
    await waitFor(
      async () =>
        (await kinds('interview')).filter((e) => (e.payload as { status: string }).status === 'done').length === 2,
    )
    expect(mock.calls['POST /api/simulation/interview/batch']).toBe(2)
    const bodies = mock.bodies['POST /api/simulation/interview/batch'] as Array<Record<string, unknown>>
    for (const body of bodies) {
      expect(body.platform).toBeTruthy()
      expect(body.timeout).toBe(240)
    }
    expect((await store.get(runId))!.stage).toBe('interviews')

    await store.update(runId, { cursors: { reportRequested: true } })
    await waitFor(async () => (await store.get(runId))!.status === 'done')
    ac.abort()
    await loop

    const done = (await store.get(runId))!
    expect(done.envState).toBe('closed')
    expect(done.envKeepaliveUntil).toBeNull()
    expect(mock.calls['POST /api/simulation/close-env']).toBe(1)
    expect((await windows()).at(-1)).toMatchObject({ closed: true, reason: 'report_requested' })
    expect((await kinds('report_text')).length).toBeGreaterThan(0)
  },
)
