import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})

import { db } from '@/lib/db'
import { listMessages } from './chats'
import { RunActiveError, startRun } from './runs'

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
})

describe.skipIf(!process.env.DATABASE_URL)('startRun (real db)', () => {
  beforeAll(async () => {
    await db
      .insert(schema.user)
      .values({ id: userId, name: 'anon', email: `${userId}@anon.local`, emailVerified: false, isAnonymous: true, createdAt: new Date(), updatedAt: new Date() })
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

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  })
})
