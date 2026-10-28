import { rm } from 'node:fs/promises'
import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const storageDir = await vi.hoisted(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  return mkdtemp(join(tmpdir(), 'xo-seed-'))
})

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})
vi.mock('@/lib/storage', async () => {
  const { createLocalStorage } = await import('@xo/storage')
  return { storage: createLocalStorage(storageDir) }
})

import { db } from '@/lib/db'
import { storage } from '@/lib/storage'
import { createSeedUpload } from './uploads'

const userId = `us_${crypto.randomUUID()}`
const chatId = `c_${crypto.randomUUID()}`

describe.skipIf(!process.env.DATABASE_URL)('createSeedUpload (real db)', () => {
  beforeAll(async () => {
    const now = new Date()
    await db.insert(schema.user).values({
      id: userId,
      name: 'anon',
      email: `${userId}@anon.local`,
      emailVerified: false,
      isAnonymous: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.chats).values({ id: chatId, userId })
  })

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await db.$client.end()
    await rm(storageDir, { recursive: true, force: true })
  })

  it('stores the seed document as a markdown upload owned by the user and chat', async () => {
    const document = '# Scenario\n\nShould we raise prices?\n'
    const seed = await createSeedUpload({ chatId, userId, document })
    expect(seed).toEqual({
      id: expect.any(String),
      filename: 'seed.md',
      mediaType: 'text/markdown',
      sizeBytes: Buffer.byteLength(document),
    })
    const [row] = await db.select().from(schema.uploads).where(eq(schema.uploads.id, seed.id))
    expect(row).toMatchObject({ userId, chatId, filename: 'seed.md', mediaType: 'text/markdown' })
    expect(new TextDecoder().decode(await storage.get(row!.storageKey))).toBe(document)
  })
})
