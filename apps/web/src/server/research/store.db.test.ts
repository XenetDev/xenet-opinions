import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@xo/db')
  return { db: createDb(process.env.DATABASE_URL ?? 'postgresql://localhost:1/none') }
})

import { db } from '@/lib/db'
import { readOwnedResearch, saveResearch } from './store'

const owner = `ur_${crypto.randomUUID()}`
const other = `uo_${crypto.randomUUID()}`
const research = {
  query: 'Should Toyota raise prices?',
  digest: '[1] Title: excerpt',
  sources: [{ title: 'Title', url: 'https://example.com', excerpt: 'excerpt', publishedAt: '2026-10-01' }],
}

describe.skipIf(!process.env.DATABASE_URL)('research store (real db)', () => {
  beforeAll(async () => {
    const now = new Date()
    for (const id of [owner, other])
      await db.insert(schema.user).values({
        id,
        name: id,
        email: `${id}@test.local`,
        emailVerified: false,
        isAnonymous: true,
        createdAt: now,
        updatedAt: now,
      })
  })

  afterAll(async () => {
    for (const id of [owner, other]) await db.delete(schema.user).where(eq(schema.user.id, id))
    await db.$client.end()
  })

  it('saves research for a chat and reads it back only for its owner', async () => {
    const id = await saveResearch({ userId: owner, chatId: 'c_research', research })
    expect(id).toEqual(expect.any(String))
    expect(await readOwnedResearch(id, owner)).toEqual(research)
    expect(await readOwnedResearch(id, other)).toBeNull()
    expect(await readOwnedResearch('missing', owner)).toBeNull()
    const [row] = await db.select().from(schema.research).where(eq(schema.research.id, id))
    expect(row).toMatchObject({ userId: owner, chatId: 'c_research' })
  })
})
