import { schema } from '@xo/db'
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})
vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }))

import { db } from '@/lib/db'
import { createInterviewQuestion } from './interview-window'

const userId = `ur_${crypto.randomUUID()}`
const roster = [
  { id: '1', name: 'Ada', topics: [] },
  { id: '2', name: 'Bo', topics: [] },
]

const seed = async (input: { startedAt: Date; until: Date }) => {
  const chatId = `c_${crypto.randomUUID()}`
  const anchor = `a_${crypto.randomUUID()}`
  await db.insert(schema.chats).values({ id: chatId, userId })
  await db.insert(schema.messages).values({
    id: anchor,
    chatId,
    role: 'assistant',
    parts: [{ type: 'data-agents', id: 'agents', data: { count: 2, profiles: roster } }],
  })
  const [run] = await db
    .insert(schema.runs)
    .values({
      id: crypto.randomUUID(),
      chatId,
      userId,
      assistantMessageId: anchor,
      status: 'running',
      stage: 'interviews',
      config: { requirement: 'Run it', maxRounds: 2, uploadIds: [] },
      ids: { simulationId: 'sim1' },
      cursors: { interviewsStartedAt: input.startedAt.toISOString() },
      envState: 'open',
      envKeepaliveUntil: input.until,
    })
    .returning()
  return run!
}

describe.skipIf(!process.env.DATABASE_URL)('createInterviewQuestion (real db)', () => {
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
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
  })

  it('inserts pending rows, appends pending interview events and extends the window', async () => {
    const now = new Date()
    const run = await seed({
      startedAt: new Date(now.getTime() - 10 * 60_000),
      until: new Date(now.getTime() + 60_000),
    })
    const { questionId, interviewIds } = await createInterviewQuestion({ run, agentIds: ['1', '2'], text: 'Why?', now })
    expect(interviewIds).toHaveLength(2)

    const rows = await db.select().from(schema.interviews).where(eq(schema.interviews.runId, run.id))
    expect(rows.map((r) => r.id).sort()).toEqual([...interviewIds].sort())
    for (const row of rows) {
      expect(row).toMatchObject({
        questionId,
        chatId: run.chatId,
        messageId: run.assistantMessageId,
        question: 'Why?',
        status: 'pending',
        answer: null,
      })
    }
    expect(rows.map((r) => [r.agentId, r.agentName]).sort()).toEqual([
      ['1', 'Ada'],
      ['2', 'Bo'],
    ])

    const events = await db
      .select()
      .from(schema.runEvents)
      .where(eq(schema.runEvents.runId, run.id))
      .orderBy(asc(schema.runEvents.seq))
    expect(events.map((e) => [e.kind, e.partId])).toEqual(interviewIds.map((id) => ['interview', `interview:${id}`]))
    expect(events[0]!.payload).toEqual({
      id: interviewIds[0],
      questionId,
      agentId: '1',
      agentName: 'Ada',
      question: 'Why?',
      status: 'pending',
    })

    const [after] = await db.select().from(schema.runs).where(eq(schema.runs.id, run.id))
    expect(after!.envKeepaliveUntil!.getTime()).toBe(now.getTime() + 60_000 + 2 * 5 * 60_000)
  })

  it('caps the window at sixty minutes after it opened', async () => {
    const now = new Date()
    const startedAt = new Date(now.getTime() - 58 * 60_000)
    const run = await seed({ startedAt, until: new Date(now.getTime() + 60_000) })
    await createInterviewQuestion({ run, agentIds: ['1', '2'], text: 'Why?', now })
    const [after] = await db.select().from(schema.runs).where(eq(schema.runs.id, run.id))
    expect(after!.envKeepaliveUntil!.getTime()).toBe(startedAt.getTime() + 60 * 60_000)
  })
})
