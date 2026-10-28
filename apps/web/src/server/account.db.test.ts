import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})
vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }))

import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { deleteUserStorage, relinkAnonymousUser } from './account'
import { listChats } from './chats'
import { runsStartedSince } from './runs'

const ids = {
  a: `ua_${crypto.randomUUID()}`,
  b: `ub_${crypto.randomUUID()}`,
  c: `uc_${crypto.randomUUID()}`,
  empty: `ue_${crypto.randomUUID()}`,
}
const now = new Date()
const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

const mkUser = (id: string, isAnonymous: boolean) =>
  db.insert(schema.user).values({
    id,
    name: id,
    email: `${id}@test.local`,
    emailVerified: false,
    isAnonymous,
    createdAt: now,
    updatedAt: now,
  })

const userExists = async (id: string) =>
  (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, id))).length === 1

const mkChat = (userId: string) => {
  const id = `c_${crypto.randomUUID()}`
  return db
    .insert(schema.chats)
    .values({ id, userId })
    .then(() => id)
}

describe.skipIf(!process.env.DATABASE_URL)('account (real db)', () => {
  beforeAll(async () => {
    await mkUser(ids.a, true)
    await mkUser(ids.b, false)
    await mkUser(ids.c, false)
    await mkUser(ids.empty, true)
  })

  afterAll(async () => {
    for (const id of Object.values(ids)) await db.delete(schema.user).where(eq(schema.user.id, id))
    await db.$client.end()
  })

  it('moves chats, runs and uploads and leaves other users untouched', async () => {
    const chatA = await mkChat(ids.a)
    await mkChat(ids.b)
    const chatC = await mkChat(ids.c)
    const assistantId = `m_${crypto.randomUUID()}`
    await db.insert(schema.messages).values([
      { id: `m_${crypto.randomUUID()}`, chatId: chatA, role: 'user', parts: [] },
      { id: assistantId, chatId: chatA, role: 'assistant', parts: [] },
    ])
    await db.insert(schema.runs).values({
      id: crypto.randomUUID(),
      chatId: chatA,
      userId: ids.a,
      assistantMessageId: assistantId,
      status: 'done',
      queuedAt: now,
      config: { requirement: 'x', maxRounds: 1, uploadIds: [] },
    })
    await db.insert(schema.uploads).values({
      id: `up_${crypto.randomUUID()}`,
      userId: ids.a,
      chatId: chatA,
      storageKey: 'k',
      filename: 'a.txt',
      mediaType: 'text/plain',
      sizeBytes: 1,
    })

    await expect(relinkAnonymousUser({ fromUserId: ids.a, toUserId: ids.b })).resolves.toEqual({
      chats: 1,
      runs: 1,
      uploads: 1,
    })

    expect(await listChats(ids.b)).toHaveLength(2)
    expect(await listChats(ids.a)).toHaveLength(0)
    expect((await runsStartedSince(ids.b, dayAgo)).count).toBe(1)
    expect((await listChats(ids.c)).map((c) => c.id)).toEqual([chatC])
    expect(await userExists(ids.a)).toBe(false)
    expect(await userExists(ids.b)).toBe(true)
  })

  it('never deletes a registered source user', async () => {
    const owner = `uk_${crypto.randomUUID()}`
    await mkUser(owner, false)
    try {
      await relinkAnonymousUser({ fromUserId: owner, toUserId: ids.b })
      expect(await userExists(owner)).toBe(true)
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })

  it('returns zeros for an anonymous user with nothing and leaves the target unchanged', async () => {
    const before = await listChats(ids.b)
    await expect(relinkAnonymousUser({ fromUserId: ids.empty, toUserId: ids.b })).resolves.toEqual({
      chats: 0,
      runs: 0,
      uploads: 0,
    })
    expect(await listChats(ids.b)).toEqual(before)
  })

  it('does nothing when both ids are the same', async () => {
    const chatId = await mkChat(ids.c)
    const spy = vi.spyOn(db, 'transaction')
    await expect(relinkAnonymousUser({ fromUserId: ids.c, toUserId: ids.c })).resolves.toEqual({
      chats: 0,
      runs: 0,
      uploads: 0,
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
    expect(chat?.userId).toBe(ids.c)
  })

  it('rolls back every moved row when a later update fails', async () => {
    const owner = `ur_${crypto.randomUUID()}`
    await mkUser(owner, true)
    try {
      const chatId = await mkChat(owner)
      const assistantId = `m_${crypto.randomUUID()}`
      await db.insert(schema.messages).values({ id: assistantId, chatId, role: 'assistant', parts: [] })
      const runId = crypto.randomUUID()
      await db.insert(schema.runs).values({
        id: runId,
        chatId,
        userId: owner,
        assistantMessageId: assistantId,
        status: 'done',
        queuedAt: now,
        config: { requirement: 'x', maxRounds: 1, uploadIds: [] },
      })
      const uploadId = `up_${crypto.randomUUID()}`
      await db.insert(schema.uploads).values({
        id: uploadId,
        userId: owner,
        chatId,
        storageKey: 'k',
        filename: 'a.txt',
        mediaType: 'text/plain',
        sizeBytes: 1,
      })
      const real = db.transaction.bind(db)
      const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(((run: Parameters<typeof real>[0], config) =>
        real(async (tx) => {
          const update = tx.update.bind(tx)
          let calls = 0
          tx.update = ((table: Parameters<typeof update>[0]) => {
            if (++calls === 3) throw new Error('boom')
            return update(table)
          }) as typeof tx.update
          return run(tx)
        }, config)) as typeof db.transaction)

      await expect(relinkAnonymousUser({ fromUserId: owner, toUserId: ids.b })).rejects.toThrow('boom')
      spy.mockRestore()

      const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
      const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId))
      const [upload] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, uploadId))
      expect([chat?.userId, run?.userId, upload?.userId]).toEqual([owner, owner, owner])
      expect(await userExists(owner)).toBe(true)
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })

  it('restores the anonymous user and its chats when the transaction fails after the delete', async () => {
    const owner = `ux_${crypto.randomUUID()}`
    await mkUser(owner, true)
    try {
      const chatId = await mkChat(owner)
      const real = db.transaction.bind(db)
      const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(((run: Parameters<typeof real>[0], config) =>
        real(async (tx) => {
          await run(tx)
          expect(await tx.select().from(schema.user).where(eq(schema.user.id, owner))).toEqual([])
          throw new Error('boom')
        }, config)) as typeof db.transaction)

      await expect(relinkAnonymousUser({ fromUserId: owner, toUserId: ids.b })).rejects.toThrow('boom')
      spy.mockRestore()

      expect(await userExists(owner)).toBe(true)
      const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
      expect(chat?.userId).toBe(owner)
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })

  it('deletes every blob of a user and tolerates a rejected delete', async () => {
    const owner = `ud_${crypto.randomUUID()}`
    await mkUser(owner, false)
    try {
      const chatId = await mkChat(owner)
      await db.insert(schema.uploads).values(
        ['key-1', 'key-2'].map((storageKey) => ({
          id: `up_${crypto.randomUUID()}`,
          userId: owner,
          chatId,
          storageKey,
          filename: storageKey,
          mediaType: 'text/plain',
          sizeBytes: 1,
        })),
      )
      vi.mocked(storage.delete).mockReset()
      vi.mocked(storage.delete).mockRejectedValueOnce(new Error('blob gone'))

      await expect(deleteUserStorage(owner)).resolves.toBeUndefined()

      expect(
        vi
          .mocked(storage.delete)
          .mock.calls.map((c) => c[0])
          .sort(),
      ).toEqual(['key-1', 'key-2'])
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })
})
