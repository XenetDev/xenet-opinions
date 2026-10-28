import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})
vi.mock('./runs', async (original) => {
  const actual = await original<typeof import('./runs')>()
  return { ...actual, cancelActiveRun: vi.fn(actual.cancelActiveRun) }
})
vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }))

import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { deleteChat, listChats, renameChat } from './chats'
import { cancelActiveRun } from './runs'

const userId = `ul_${crypto.randomUUID()}`
const otherId = `uo_${crypto.randomUUID()}`
const now = new Date()

const mkUser = (id: string) =>
  db.insert(schema.user).values({
    id,
    name: 'anon',
    email: `${id}@anon.local`,
    emailVerified: false,
    isAnonymous: true,
    createdAt: now,
    updatedAt: now,
  })

const mkRun = (chatId: string, owner: string, status: 'queued' | 'running' | 'done', queuedAt: Date) =>
  db.insert(schema.runs).values({
    id: crypto.randomUUID(),
    chatId,
    userId: owner,
    assistantMessageId: `m_${crypto.randomUUID()}`,
    status,
    queuedAt,
    config: { requirement: 'x', maxRounds: 1, uploadIds: [] },
  })

describe.skipIf(!process.env.DATABASE_URL)('chats (real db)', () => {
  beforeAll(async () => {
    await mkUser(userId)
    await mkUser(otherId)
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.delete(schema.user).where(eq(schema.user.id, otherId))
    await db.$client.end()
  })

  it('deletes a chat with an active run, its rows, and its blobs', async () => {
    const chatId = `c_${crypto.randomUUID()}`
    await db.insert(schema.chats).values({ id: chatId, userId })
    const assistantId = `m_${crypto.randomUUID()}`
    await db.insert(schema.messages).values([
      { id: `m_${crypto.randomUUID()}`, chatId, role: 'user', parts: [] },
      { id: assistantId, chatId, role: 'assistant', parts: [] },
    ])
    const runId = crypto.randomUUID()
    await db.insert(schema.runs).values({
      id: runId,
      chatId,
      userId,
      assistantMessageId: assistantId,
      status: 'running',
      config: { requirement: 'x', maxRounds: 1, uploadIds: [] },
    })
    await db.insert(schema.runEvents).values({ runId, seq: 1, kind: 'x', payload: {} })
    await db.insert(schema.uploads).values([
      {
        id: `up_${crypto.randomUUID()}`,
        userId,
        chatId,
        storageKey: 'key-a',
        filename: 'a.txt',
        mediaType: 'text/plain',
        sizeBytes: 1,
      },
      {
        id: `up_${crypto.randomUUID()}`,
        userId,
        chatId,
        storageKey: 'key-b',
        filename: 'b.txt',
        mediaType: 'text/plain',
        sizeBytes: 1,
      },
    ])
    vi.mocked(storage.delete).mockReset()
    vi.mocked(cancelActiveRun).mockClear()
    vi.mocked(storage.delete).mockRejectedValueOnce(new Error('blob gone'))

    await expect(deleteChat(chatId)).resolves.toBeUndefined()

    expect(cancelActiveRun).toHaveBeenCalledWith(chatId)
    expect(
      vi
        .mocked(storage.delete)
        .mock.calls.map((c) => c[0])
        .sort(),
    ).toEqual(['key-a', 'key-b'])
    expect(await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))).toHaveLength(0)
    expect(await db.select().from(schema.messages).where(eq(schema.messages.chatId, chatId))).toHaveLength(0)
    expect(await db.select().from(schema.runs).where(eq(schema.runs.chatId, chatId))).toHaveLength(0)
    expect(await db.select().from(schema.runEvents).where(eq(schema.runEvents.runId, runId))).toHaveLength(0)
    expect(await db.select().from(schema.uploads).where(eq(schema.uploads.chatId, chatId))).toHaveLength(0)
  })

  it('deletes a chat with no runs or uploads', async () => {
    const chatId = `c_${crypto.randomUUID()}`
    await db.insert(schema.chats).values({ id: chatId, userId })
    await deleteChat(chatId)
    expect(await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))).toHaveLength(0)
  })

  it('renames a chat', async () => {
    const chatId = `c_${crypto.randomUUID()}`
    await db.insert(schema.chats).values({ id: chatId, userId })
    await renameChat(chatId, 'Renamed')
    const [row] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId))
    expect(row?.title).toBe('Renamed')
  })

  it('lists only owned chats by updatedAt desc with the latest run status', async () => {
    const owner = `ul_${crypto.randomUUID()}`
    await mkUser(owner)
    try {
      const [a, b, c] = [`c_${crypto.randomUUID()}`, `c_${crypto.randomUUID()}`, `c_${crypto.randomUUID()}`]
      await db.insert(schema.chats).values([
        { id: a, userId: owner, title: 'old', updatedAt: new Date('2026-01-01T00:00:00Z') },
        { id: b, userId: owner, title: 'new', updatedAt: new Date('2026-01-03T00:00:00Z') },
        { id: c, userId: owner, title: 'mid', updatedAt: new Date('2026-01-02T00:00:00Z') },
        { id: `c_${crypto.randomUUID()}`, userId: otherId, title: 'theirs' },
      ])
      await mkRun(b, owner, 'done', new Date('2026-01-03T00:00:00Z'))
      await mkRun(b, owner, 'running', new Date('2026-01-03T01:00:00Z'))
      await mkRun(c, owner, 'done', new Date('2026-01-02T00:00:00Z'))

      const list = await listChats(owner)
      expect(list.map((x) => [x.id, x.runStatus])).toEqual([
        [b, 'running'],
        [c, 'done'],
        [a, 'none'],
      ])
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })

  it('lists the first uploaded file of each chat', async () => {
    const owner = `ul_${crypto.randomUUID()}`
    await mkUser(owner)
    try {
      const [a, b] = [`c_${crypto.randomUUID()}`, `c_${crypto.randomUUID()}`]
      await db.insert(schema.chats).values([
        { id: a, userId: owner, title: 'with files', updatedAt: new Date('2026-01-02T00:00:00Z') },
        { id: b, userId: owner, title: 'no files', updatedAt: new Date('2026-01-01T00:00:00Z') },
      ])
      const upload = (filename: string, createdAt: Date) => ({
        id: `up_${crypto.randomUUID()}`,
        userId: owner,
        chatId: a,
        storageKey: `key-${filename}`,
        filename,
        mediaType: 'text/plain',
        sizeBytes: 1,
        createdAt,
      })
      await db
        .insert(schema.uploads)
        .values([
          upload('second.md', new Date('2026-01-02T00:00:00Z')),
          upload('first.pdf', new Date('2026-01-01T00:00:00Z')),
        ])

      const list = await listChats(owner)
      expect(list.map((x) => [x.id, x.firstFile])).toEqual([
        [a, 'first.pdf'],
        [b, undefined],
      ])
      expect('firstFile' in list[1]!).toBe(false)
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })

  it('breaks a first-file timestamp tie by file name', async () => {
    const owner = `ut_${crypto.randomUUID()}`
    await mkUser(owner)
    try {
      const chatId = `c_${crypto.randomUUID()}`
      await db.insert(schema.chats).values({ id: chatId, userId: owner, title: 'tie' })
      const createdAt = new Date('2026-01-01T00:00:00Z')
      await db.insert(schema.uploads).values(
        ['b.md', 'c.md', 'a.pdf'].map((filename) => ({
          id: `up_${crypto.randomUUID()}`,
          userId: owner,
          chatId,
          storageKey: `key-${filename}`,
          filename,
          mediaType: 'text/plain',
          sizeBytes: 1,
          createdAt,
        })),
      )
      const [chat] = await listChats(owner)
      expect(chat?.firstFile).toBe('a.pdf')
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, owner))
    }
  })
})
