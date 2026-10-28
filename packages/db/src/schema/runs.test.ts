import { eq, sql } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { createDb } from '../client'
import * as schema from './index'

it.skipIf(!process.env.DATABASE_URL)('enforces run constraints and cascades', async () => {
  const db = createDb(process.env.DATABASE_URL!)
  const userId = `ur_${crypto.randomUUID()}`
  const chatId = `c_${userId}`
  const config = { requirement: 'r', maxRounds: 3, uploadIds: [] }
  await db.insert(schema.user).values({
    id: userId,
    name: 'anon',
    email: `${userId}@anon.local`,
    emailVerified: false,
    isAnonymous: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  try {
    await db.insert(schema.chats).values({ id: chatId, userId })
    await db.insert(schema.runs).values({ id: `r1_${userId}`, chatId, userId, assistantMessageId: 'a1', config })
    await expect(
      db.insert(schema.runs).values({ id: `r2_${userId}`, chatId, userId, assistantMessageId: 'a2', config }),
    ).rejects.toHaveProperty('cause.message', expect.stringContaining('runs_one_active_per_chat'))
    await db
      .update(schema.runs)
      .set({ status: 'done' })
      .where(eq(schema.runs.id, `r1_${userId}`))
    await db.insert(schema.runs).values({ id: `r2_${userId}`, chatId, userId, assistantMessageId: 'a2', config })

    await db.insert(schema.runEvents).values({ runId: `r1_${userId}`, seq: 1, kind: 'k', payload: {} })
    await expect(
      db.insert(schema.runEvents).values({ runId: `r1_${userId}`, seq: 1, kind: 'k', payload: {} }),
    ).rejects.toHaveProperty('cause.message', expect.stringContaining('run_events_run_id_seq_idx'))

    await db.insert(schema.uploads).values({
      id: `up_${userId}`,
      userId,
      chatId,
      storageKey: 'k',
      filename: 'f.txt',
      mediaType: 'text/plain',
      sizeBytes: 1,
    })

    await db.delete(schema.chats).where(eq(schema.chats.id, chatId))
    expect(await db.select().from(schema.runs).where(eq(schema.runs.chatId, chatId))).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.runEvents)
        .where(eq(schema.runEvents.runId, `r1_${userId}`)),
    ).toHaveLength(0)
    expect(await db.select().from(schema.uploads).where(eq(schema.uploads.chatId, chatId))).toHaveLength(0)
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
  }
})

it.skipIf(!process.env.DATABASE_URL)('indexes the chat list, latest run and uploads lookups', async () => {
  const db = createDb(process.env.DATABASE_URL!)
  try {
    const rows = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename in ('chats', 'runs', 'uploads')`,
    )
    expect(rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'chats_user_id_updated_at_idx',
        'runs_chat_id_queued_at_idx',
        'uploads_chat_id_created_at_filename_idx',
      ]),
    )
  } finally {
    await db.$client.end()
  }
})
