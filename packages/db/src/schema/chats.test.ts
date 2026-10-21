import { eq } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { createDb } from '../client'
import * as schema from './index'

it.skipIf(!process.env.DATABASE_URL)('inserts a chat and a message and cascades delete', async () => {
  const db = createDb(process.env.DATABASE_URL!)
  const userId = `u_${Date.now()}`
  await db.insert(schema.user).values({ id: userId, name: 'anon', email: `${userId}@anon.local`, emailVerified: false, isAnonymous: true, createdAt: new Date(), updatedAt: new Date() })
  try {
    await db.insert(schema.chats).values({ id: 'c1' + userId, userId })
    await db.insert(schema.messages).values({ id: 'm1' + userId, chatId: 'c1' + userId, role: 'user', parts: [{ type: 'text', text: 'hi' }] })
    await db.delete(schema.chats).where(eq(schema.chats.id, 'c1' + userId))
    const left = await db.select().from(schema.messages).where(eq(schema.messages.chatId, 'c1' + userId))
    expect(left).toHaveLength(0)
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  }
})
