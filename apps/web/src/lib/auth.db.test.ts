import { schema } from '@xo/db'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', async () => {
  const { parseEnv } = await import('@/env.schema')
  return {
    env: parseEnv({
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:1/none',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      MIROFISH_URL: 'http://localhost:5001',
    }),
  }
})
vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }))
vi.mock('@/lib/mailer', () => ({ getMailer: () => ({ kind: 'console', send: vi.fn(async () => {}) }) }))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const key = `${ip}|/sign-in/magic-link`

const requestLink = (n: number) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: `rl${n}-${crypto.randomUUID()}@example.com`, callbackURL: '/' }),
    }),
  )

describe.skipIf(!process.env.DATABASE_URL)('auth rate limit (real db)', () => {
  afterAll(async () => {
    await db.delete(schema.rateLimit).where(eq(schema.rateLimit.key, key))
    await db.$client.end()
  })

  it('lets at most 3 concurrent magic-link requests through and keeps one row per key', async () => {
    const responses = await Promise.all([0, 1, 2, 3, 4].map(requestLink))
    const statuses = responses.map((r) => r.status)
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(3)
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2)
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true)
    const rows = await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, key))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.count).toBe(3)
  })
})
