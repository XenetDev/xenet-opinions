import { schema } from '@xo/db'
import { type EventKind, partIdFor } from '@xo/engine'
import { and, asc, eq, ne } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})

import { db } from '@/lib/db'
import { retryRun } from './retry'
import { RunActiveError, runsStartedSince } from './runs'

const userId = `ur_${crypto.randomUUID()}`
const chatId = `c_${crypto.randomUUID()}`
const oldRunId = `r_${crypto.randomUUID()}`
const oldAssistantId = `a_${crypto.randomUUID()}`

const ev = (kind: EventKind, payload: unknown) => ({ kind, partId: partIdFor(kind, payload), payload })

const sources = ev('sources', { files: [] })
const ontology = ev('ontology', { entityTypes: ['Person'], relationTypes: ['KNOWS'] })
const graph = ev('graph', { graphId: 'g', nodeCount: 0, edgeCount: 0, nodes: [], links: [] })
const oldEvents = [
  sources,
  ev('stage', { stage: 'ontology', status: 'running' }),
  ontology,
  ev('stage', { stage: 'ontology', status: 'done' }),
  ev('stage', { stage: 'graph_build', status: 'done' }),
  graph,
  ev('stage', { stage: 'sim_prepare', status: 'running' }),
  ev('stage', { stage: 'sim_prepare', status: 'failed', message: 'boom' }),
  ev('error', { stage: 'sim_prepare', code: 'api', message: 'boom' }),
]

describe.skipIf(!process.env.DATABASE_URL)('retryRun (real db)', () => {
  beforeAll(async () => {
    await db.insert(schema.user).values({
      id: userId,
      name: 'anon',
      email: `${userId}@anon.local`,
      emailVerified: false,
      isAnonymous: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(schema.chats).values({ id: chatId, userId })
    await db.insert(schema.messages).values([
      { id: `m_${crypto.randomUUID()}`, chatId, role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: oldAssistantId, chatId, role: 'assistant', parts: [] },
    ])
    await db.insert(schema.runs).values({
      id: oldRunId,
      chatId,
      userId,
      assistantMessageId: oldAssistantId,
      status: 'failed',
      stage: 'sim_prepare',
      config: { requirement: 'hi', maxRounds: 2, uploadIds: [] },
      ids: { projectId: 'p', graphId: 'g', simulationId: 's' },
      cursors: { simStarted: true, startAcked: true, retries: 2, startAttempts: 1, idlePolls: 1, agentLogLine: 0 },
      error: { stage: 'sim_prepare', code: 'api', message: 'boom' },
    })
    await db.insert(schema.runEvents).values(oldEvents.map((e, i) => ({ runId: oldRunId, seq: i + 1, ...e })))
  })

  it('queues a new run that resumes from the failed stage', async () => {
    const { run, assistantMessageId } = await retryRun({ chatId, userId })

    expect(run.id).not.toBe(oldRunId)
    expect(run.retryOf).toBe(oldRunId)
    expect(run.status).toBe('queued')
    expect(run.stage).toBe('sim_prepare')
    expect(run.userId).toBe(userId)
    expect(run.assistantMessageId).toBe(assistantMessageId)
    expect(run.error).toBeNull()
    expect(run.config).toEqual({ requirement: 'hi', maxRounds: 2, uploadIds: [] })
    expect(run.ids).toEqual({ projectId: 'p', graphId: 'g', simulationId: 's' })
    expect(run.cursors).toEqual({ retries: 0, startAttempts: 0, idlePolls: 0 })

    const [message] = await db.select().from(schema.messages).where(eq(schema.messages.id, assistantMessageId))
    expect(message).toMatchObject({ chatId, role: 'assistant', parts: [] })

    const events = await db
      .select()
      .from(schema.runEvents)
      .where(eq(schema.runEvents.runId, run.id))
      .orderBy(asc(schema.runEvents.seq))
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(events.map(({ kind, partId, payload }) => ({ kind, partId, payload }))).toEqual([
      ...oldEvents.slice(0, 6),
      ev('stage', { stage: 'sim_prepare', status: 'pending', message: 'Retrying' }),
    ])

    const [old] = await db.select().from(schema.runs).where(eq(schema.runs.id, oldRunId))
    expect(old!.status).toBe('failed')
    expect(old!.assistantMessageId).toBe(oldAssistantId)
    const kept = await db
      .select()
      .from(schema.runEvents)
      .where(eq(schema.runEvents.runId, oldRunId))
      .orderBy(asc(schema.runEvents.seq))
    expect(kept.map(({ seq, kind, partId, payload }) => ({ seq, kind, partId, payload }))).toEqual(
      oldEvents.map((e, i) => ({ seq: i + 1, ...e })),
    )
    const [oldMessage] = await db.select().from(schema.messages).where(eq(schema.messages.id, oldAssistantId))
    expect(oldMessage!.parts).toEqual([])
  })

  it('refuses a second retry while the new run is queued', async () => {
    await expect(retryRun({ chatId, userId })).rejects.toBeInstanceOf(RunActiveError)
    const others = await db
      .select()
      .from(schema.runs)
      .where(and(eq(schema.runs.chatId, chatId), ne(schema.runs.id, oldRunId)))
    expect(others).toHaveLength(1)
  })

  const seedFailed = async (
    stage: 'graph_build' | 'report',
    ids: Record<string, string>,
    cursors: Record<string, unknown>,
  ) => {
    const chat = `c_${crypto.randomUUID()}`
    const assistant = `a_${crypto.randomUUID()}`
    await db.insert(schema.chats).values({ id: chat, userId })
    await db.insert(schema.messages).values({ id: assistant, chatId: chat, role: 'assistant', parts: [] })
    await db.insert(schema.runs).values({
      id: `r_${crypto.randomUUID()}`,
      chatId: chat,
      userId,
      assistantMessageId: assistant,
      status: 'failed',
      stage,
      config: { requirement: 'hi', maxRounds: 2, uploadIds: [] },
      ids,
      cursors,
      error: { stage, code: 'api', message: 'boom' },
    })
    return chat
  }

  it('drops the graph task id when retrying graph_build', async () => {
    const chat = await seedFailed('graph_build', { projectId: 'p', graphTaskId: 'gt' }, { retries: 1 })
    const { run } = await retryRun({ chatId: chat, userId })
    expect(run.stage).toBe('graph_build')
    expect(run.ids).toEqual({ projectId: 'p' })
    expect(run.cursors).toEqual({ retries: 0, startAttempts: 0, idlePolls: 0 })
  })

  it('drops report ids and cursors when retrying report', async () => {
    const chat = await seedFailed(
      'report',
      { projectId: 'p', graphId: 'g', simulationId: 's', prepareTaskId: 'pt', reportId: 'rep', reportTaskId: 'rt' },
      {
        simStarted: true,
        startAcked: true,
        agentLogLine: 9,
        reportEventCount: 4,
        reportOutline: { sections: [] },
        retries: 3,
      },
    )
    const { run } = await retryRun({ chatId: chat, userId })
    expect(run.stage).toBe('report')
    expect(run.ids).toEqual({ projectId: 'p', graphId: 'g', simulationId: 's', prepareTaskId: 'pt' })
    expect(run.cursors).toEqual({ simStarted: true, startAcked: true, retries: 0, startAttempts: 0, idlePolls: 0 })
  })

  it('restarts from ontology with new uploads, copying no events', async () => {
    const chat = `c_${crypto.randomUUID()}`
    const assistant = `a_${crypto.randomUUID()}`
    const failedId = `r_${crypto.randomUUID()}`
    await db.insert(schema.chats).values({ id: chat, userId })
    await db.insert(schema.messages).values({ id: assistant, chatId: chat, role: 'assistant', parts: [] })
    await db.insert(schema.runs).values({
      id: failedId,
      chatId: chat,
      userId,
      assistantMessageId: assistant,
      status: 'failed',
      stage: 'graph_build',
      config: { requirement: 'hi', maxRounds: 2, uploadIds: ['up1', 'seed1'], pauseForInterviews: true },
      ids: { projectId: 'p', graphTaskId: 'gt' },
      cursors: { retries: 1 },
      error: { stage: 'graph_build', code: 'no_actors', message: 'none' },
    })
    await db
      .insert(schema.runEvents)
      .values(oldEvents.slice(0, 4).map((e, i) => ({ runId: failedId, seq: i + 1, ...e })))
    const since = new Date(Date.now() - 60_000)
    const before = await runsStartedSince(userId, since)

    const { run } = await retryRun({ chatId: chat, userId, restart: { uploadIds: ['up1', 'seed2'] } })

    expect(run.retryOf).toBe(failedId)
    expect(run.status).toBe('queued')
    expect(run.stage).toBe('ontology')
    expect(run.ids).toEqual({})
    expect(run.cursors).toEqual({ retries: 0, startAttempts: 0, idlePolls: 0 })
    expect(run.config).toEqual({
      requirement: 'hi',
      maxRounds: 2,
      uploadIds: ['up1', 'seed2'],
      pauseForInterviews: true,
    })
    const events = await db.select().from(schema.runEvents).where(eq(schema.runEvents.runId, run.id))
    expect(events.map(({ seq, kind, partId, payload }) => ({ seq, kind, partId, payload }))).toEqual([
      { seq: 1, ...ev('stage', { stage: 'ontology', status: 'pending', message: 'Retrying' }) },
    ])
    expect((await runsStartedSince(userId, since)).count).toBe(before.count)
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  })
})
