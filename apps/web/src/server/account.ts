import { schema } from '@xo/db'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { storage } from '@/lib/storage'

const { chats, runs, uploads, user } = schema

export async function relinkAnonymousUser(input: {
  fromUserId: string
  toUserId: string
}): Promise<{ chats: number; runs: number; uploads: number }> {
  const { fromUserId, toUserId } = input
  if (fromUserId === toUserId) return { chats: 0, runs: 0, uploads: 0 }
  return db.transaction(async (tx) => {
    const movedChats = await tx
      .update(chats)
      .set({ userId: toUserId })
      .where(eq(chats.userId, fromUserId))
      .returning({ id: chats.id })
    const movedRuns = await tx
      .update(runs)
      .set({ userId: toUserId })
      .where(eq(runs.userId, fromUserId))
      .returning({ id: runs.id })
    const movedUploads = await tx
      .update(uploads)
      .set({ userId: toUserId })
      .where(eq(uploads.userId, fromUserId))
      .returning({ id: uploads.id })
    await tx.delete(user).where(and(eq(user.id, fromUserId), eq(user.isAnonymous, true)))
    return { chats: movedChats.length, runs: movedRuns.length, uploads: movedUploads.length }
  })
}

export async function deleteUserStorage(userId: string): Promise<void> {
  const rows = await db.select({ key: uploads.storageKey }).from(uploads).where(eq(uploads.userId, userId))
  await Promise.allSettled(rows.map(async ({ key }) => storage.delete(key)))
}
