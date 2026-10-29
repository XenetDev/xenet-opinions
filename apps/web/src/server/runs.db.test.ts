import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})

vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }))

import { db } from '@/lib/db'
import { listMessages } from './chats'
import { RunActiveError, runsStartedSince, startRun } from './runs'

const userId = `ur_${crypto.randomUUID()}`

const mkChat = async () => {
  const id = `c_${crypto.randomUUID()}`
  await db.insert(schema.chats).values({ id, userId })
  return id
}

const input = (chatId: string) => ({
  chatId,
  userId,
  message: { id: `m_${crypto.randomUUID()}`, parts: [{ type: 'text', text: 'hi' }] },
  text: 'hi',
  uploadIds: [],
  maxRounds: 2,
  pauseForInterviews: false,
})

describe.skipIf(!process.env.DATABASE_URL)('startRun (real db)', () => {
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

  it('lists the user message before the assistant placeholder', async () => {
    const chatId = await mkChat()
    const body = input(chatId)
    const { assistantMessageId } = await startRun(body)
    const listed = await listMessages(chatId)
    expect(listed.map((m) => [m.id, m.role])).toEqual([
      [body.message.id, 'user'],
      [assistantMessageId, 'assistant'],
    ])
    expect(listed[1]!.createdAt.getTime() - listed[0]!.createdAt.getTime()).toBe(1)
  })

  it('titles an untitled chat from the first message and touches updated_at', async () => {
    const chatId = await mkChat()
    const [before] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
    const first = { ...input(chatId), text: 'x'.repeat(150) }
    await startRun(first)
    const [after] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
    expect(after!.title).toBe(`${'x'.repeat(120)}…`)
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())
    await db.update(schema.runs).set({ status: 'done' }).where(eq(schema.runs.chatId, chatId))
    await startRun({ ...input(chatId), text: 'second' })
    const [again] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
    expect(again!.title).toBe(`${'x'.repeat(120)}…`)
  })

  it('stores pauseForInterviews in the run config', async () => {
    const paused = await startRun({ ...input(await mkChat()), pauseForInterviews: true })
    expect(paused.run.config.pauseForInterviews).toBe(true)
    const plain = await startRun(input(await mkChat()))
    expect(plain.run.config.pauseForInterviews).toBe(false)
  })

  it('lets exactly one of two concurrent starts win', async () => {
    const chatId = await mkChat()
    const body = input(chatId)
    const results = await Promise.allSettled([startRun(body), startRun(body)])
    const won = results.filter((r) => r.status === 'fulfilled')
    const lost = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
    expect(won).toHaveLength(1)
    expect(lost).toHaveLength(1)
    expect(lost[0]).toBeInstanceOf(RunActiveError)
    expect(await db.select().from(schema.runs).where(eq(schema.runs.chatId, chatId))).toHaveLength(1)
    const listed = await listMessages(chatId)
    expect(listed.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(listed.filter((m) => m.role === 'user')).toHaveLength(1)
  })

  it('counts new runs including cancel-then-resend, excludes retries, scoped to this user and window', async () => {
    const otherId = `ur_${crypto.randomUUID()}`
    await db.insert(schema.user).values({
      id: otherId,
      name: 'anon',
      email: `${otherId}@anon.local`,
      emailVerified: false,
      isAnonymous: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const quotaUser = `ur_${crypto.randomUUID()}`
    await db.insert(schema.user).values({
      id: quotaUser,
      name: 'anon',
      email: `${quotaUser}@anon.local`,
      emailVerified: false,
      isAnonymous: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const at = (hours: number) => new Date(Date.now() - hours * 3_600_000)
    const seed = async (owner: string, status: 'done' | 'failed' | 'queued', queuedAt: Date) => {
      const chatId = `c_${crypto.randomUUID()}`
      await db.insert(schema.chats).values({ id: chatId, userId: owner })
      const messageId = `m_${crypto.randomUUID()}`
      await db.insert(schema.messages).values({ id: messageId, chatId, role: 'assistant', parts: [] })
      await db.insert(schema.runs).values({
        id: crypto.randomUUID(),
        chatId,
        userId: owner,
        assistantMessageId: messageId,
        status,
        queuedAt,
        config: { requirement: 'x', maxRounds: 1, uploadIds: [] },
      })
    }
    const oldest = at(5)
    await seed(quotaUser, 'done', at(30))
    await seed(quotaUser, 'failed', oldest)
    await seed(quotaUser, 'queued', at(1))
    await seed(otherId, 'done', at(2))
    const seedChat = async (
      rows: Array<{ status: 'failed' | 'queued' | 'cancelled'; hours: number; retry?: boolean }>,
    ) => {
      const chatId = await mkChat()
      let previous: string | null = null
      for (const { status, hours, retry } of rows) {
        const messageId = `m_${crypto.randomUUID()}`
        await db.insert(schema.messages).values({ id: messageId, chatId, role: 'assistant', parts: [] })
        const id = crypto.randomUUID()
        await db.insert(schema.runs).values({
          id,
          chatId,
          userId: quotaUser,
          assistantMessageId: messageId,
          retryOf: retry ? previous : null,
          status,
          queuedAt: at(hours),
          config: { requirement: 'x', maxRounds: 1, uploadIds: [] },
        })
        previous = id
      }
    }
    await seedChat([
      { status: 'failed', hours: 3 },
      { status: 'queued', hours: 2, retry: true },
    ])
    expect((await runsStartedSince(quotaUser, at(24))).count).toBe(3)
    await seedChat([
      { status: 'cancelled', hours: 4 },
      { status: 'queued', hours: 3 },
    ])
    const result = await runsStartedSince(quotaUser, at(24))
    expect(result.count).toBe(5)
    expect(result.oldestQueuedAt?.getTime()).toBe(oldest.getTime())
    expect(await runsStartedSince(`ur_${crypto.randomUUID()}`, at(24))).toEqual({ count: 0, oldestQueuedAt: null })
    await db.delete(schema.user).where(eq(schema.user.id, otherId))
    await db.delete(schema.user).where(eq(schema.user.id, quotaUser))
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  })
})
