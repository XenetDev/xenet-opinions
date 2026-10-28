import { schema } from '@xo/db'
import type { MiroFishClient } from '@xo/mirofish'
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})
vi.mock('@/env', () => ({ env: { MIROFISH_LOCALE: 'en' } }))
vi.mock('@/lib/mirofish', () => ({ mirofish: {} }))
vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }))

import { db } from '@/lib/db'
import { FollowUpError, runFollowUp } from './follow-up'

const userId = `ur_${crypto.randomUUID()}`
const t0 = new Date(Date.now() - 5 * 60_000)
const keepalive = new Date(t0.getTime() + 20 * 60_000)
const roster = [
  { id: '1', name: 'Ada', topics: [] },
  { id: '2', name: 'Bo', topics: [] },
]

const seed = async () => {
  const chatId = `c_${crypto.randomUUID()}`
  const runId = `r_${crypto.randomUUID()}`
  const anchor = `a_${crypto.randomUUID()}`
  const old = new Date(Date.now() - 60 * 60_000)
  await db.insert(schema.chats).values({ id: chatId, userId, createdAt: old, updatedAt: old })
  await db.insert(schema.messages).values([
    { id: `m_${crypto.randomUUID()}`, chatId, role: 'user', parts: [{ type: 'text', text: 'Run it' }], createdAt: old },
    {
      id: anchor,
      chatId,
      role: 'assistant',
      parts: [
        { type: 'data-agents', id: 'agents', data: { count: 2, profiles: roster } },
        { type: 'text', text: 'Report' },
      ],
      createdAt: new Date(old.getTime() + 1),
    },
  ])
  const [run] = await db
    .insert(schema.runs)
    .values({
      id: runId,
      chatId,
      userId,
      assistantMessageId: anchor,
      status: 'done',
      stage: 'finished',
      config: { requirement: 'Run it', maxRounds: 2, uploadIds: [] },
      ids: { simulationId: 'sim1' },
      envState: 'open',
      envKeepaliveUntil: keepalive,
      finishedAt: t0,
    })
    .returning()
  const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
  return { chat: chat!, run: run!, chatId, anchor }
}

const fakeMirofish = (impl: { chat?: () => Promise<unknown>; interviewBatch?: () => Promise<unknown> }) =>
  ({
    report: { chat: vi.fn(impl.chat) },
    simulation: { interviewBatch: vi.fn(impl.interviewBatch) },
  }) as unknown as MiroFishClient

const userMessage = () => ({ id: `u_${crypto.randomUUID()}`, parts: [{ type: 'text', text: 'Why?' }] })

describe.skipIf(!process.env.DATABASE_URL)('runFollowUp (real db)', () => {
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

  it('persists a report reply after the user row and bumps the chat', async () => {
    const { chat, run, chatId, anchor } = await seed()
    const message = userMessage()
    const response = await runFollowUp({
      chat,
      run,
      userMessage: message,
      text: 'Why?',
      target: 'report',
      agentIds: [],
      mirofish: fakeMirofish({ chat: async () => ({ response: 'Because.' }) }),
    })
    await response.text()

    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, chatId))
      .orderBy(asc(schema.messages.createdAt))
    expect(rows.slice(1).map((r) => [r.id === anchor ? 'anchor' : r.role, r.parts])).toEqual([
      ['anchor', expect.any(Array)],
      ['user', message.parts],
      ['assistant', [{ type: 'text', text: 'Because.', state: 'done' }]],
    ])
    expect(rows[3]!.createdAt.getTime()).toBeGreaterThan(rows[2]!.createdAt.getTime())
    const [after] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
    expect(after!.updatedAt.getTime()).toBeGreaterThan(chat.updatedAt.getTime())
    expect(await db.select().from(schema.interviews).where(eq(schema.interviews.chatId, chatId))).toEqual([])
  })

  it('leaves no orphan assistant row when the report chat fails', async () => {
    const { chat, run, chatId } = await seed()
    const message = userMessage()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await runFollowUp({
      chat,
      run,
      userMessage: message,
      text: 'Why?',
      target: 'report',
      agentIds: [],
      mirofish: fakeMirofish({ chat: async () => Promise.reject(new Error('down')) }),
    })
    expect(await response.text()).toContain('follow_up_failed')
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, chatId))
      .orderBy(asc(schema.messages.createdAt))
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'user'])
    expect(rows[2]!.id).toBe(message.id)
  })

  it('stores interview rows and parts and advances the keepalive', async () => {
    const { chat, run, chatId } = await seed()
    const now = new Date()
    const response = await runFollowUp({
      chat,
      run,
      userMessage: userMessage(),
      text: 'Why?',
      target: 'agents',
      agentIds: ['2', '1'],
      now: () => now,
      mirofish: fakeMirofish({
        interviewBatch: async () => ({ result: { results: { twitter_2: { agent_id: 2, response: 'Yes' } } } }),
      }),
    })
    await response.text()

    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, chatId))
      .orderBy(asc(schema.messages.createdAt))
    const assistant = rows.at(-1)!
    expect(assistant.parts).toEqual([
      {
        type: 'data-interview',
        id: 'interview:2',
        data: {
          id: expect.any(String),
          questionId: expect.any(String),
          agentId: '2',
          agentName: 'Bo',
          question: 'Why?',
          status: 'done',
          answer: 'Yes',
        },
      },
      {
        type: 'data-interview',
        id: 'interview:1',
        data: {
          id: expect.any(String),
          questionId: expect.any(String),
          agentId: '1',
          agentName: 'Ada',
          question: 'Why?',
          status: 'failed',
          error: 'No answer',
        },
      },
    ])
    const interviews = await db.select().from(schema.interviews).where(eq(schema.interviews.chatId, chatId))
    expect(
      interviews.map(({ runId, messageId, agentId, agentName, question, answer, status }) => ({
        runId,
        messageId,
        agentId,
        agentName,
        question,
        answer,
        status,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          runId: run.id,
          messageId: assistant.id,
          agentId: '2',
          agentName: 'Bo',
          question: 'Why?',
          answer: 'Yes',
          status: 'done',
        },
        {
          runId: run.id,
          messageId: assistant.id,
          agentId: '1',
          agentName: 'Ada',
          question: 'Why?',
          answer: null,
          status: 'failed',
        },
      ]),
    )
    expect(interviews).toHaveLength(2)
    const [after] = await db.select().from(schema.runs).where(eq(schema.runs.id, run.id))
    expect(after!.envKeepaliveUntil!.getTime()).toBe(keepalive.getTime() + 10 * 60_000)
  })

  it('writes nothing when the env is closed', async () => {
    const { chat, run, chatId } = await seed()
    await expect(
      runFollowUp({
        chat,
        run: { ...run, envState: 'closed' },
        userMessage: userMessage(),
        text: 'Why?',
        target: 'agents',
        agentIds: ['1'],
        mirofish: fakeMirofish({}),
      }),
    ).rejects.toBeInstanceOf(FollowUpError)
    expect(await db.select().from(schema.messages).where(eq(schema.messages.chatId, chatId))).toHaveLength(2)
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  })
})
