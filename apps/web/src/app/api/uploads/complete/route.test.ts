import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { BETTER_AUTH_SECRET: 's'.repeat(32) } }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), head: vi.fn() } }))
vi.mock('@/lib/db', () => ({ db: { insert: vi.fn() } }))

import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { signUploadToken } from '@/server/upload-token'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const head = vi.mocked(storage.head!)
const values = vi.fn()

const token = (overrides: Record<string, unknown> = {}) =>
  signUploadToken({
    userId: 'user1',
    chatId: 'c1',
    id: 'up1',
    key: 'uploads/user1/up1/deck.pdf',
    name: 'deck.pdf',
    mediaType: 'application/pdf',
    size: 1234,
    exp: Date.now() + 60_000,
    ...overrides,
  })

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/uploads/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.resetAllMocks()
  values.mockResolvedValue(undefined)
  vi.mocked(db.insert).mockReturnValue({ values } as never)
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
})

describe('POST /api/uploads/complete', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call({ chatId: 'c1', tokens: [token()] })
    expect(res.status).toBe(401)
  })

  it('rejects malformed bodies and too many tokens', async () => {
    for (const body of [
      { chatId: 'c1' },
      { chatId: 'c1', tokens: [] },
      { chatId: 'c1', tokens: Array(6).fill(token()) },
    ]) {
      const res = await call(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
    }
  })

  it('rejects tokens that are forged, expired, or bound to another user or chat', async () => {
    const bad = [
      `${token()}x`,
      token({ exp: Date.now() - 1 }),
      token({ userId: 'someone-else' }),
      token({ chatId: 'other-chat' }),
    ]
    for (const t of bad) {
      const res = await call({ chatId: 'c1', tokens: [t] })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
    }
    expect(head).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('rejects the same upload twice in one request', async () => {
    const res = await call({ chatId: 'c1', tokens: [token(), token()] })
    expect(res.status).toBe(400)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('rejects with missing when the object is absent or a different size', async () => {
    head.mockResolvedValueOnce(null).mockResolvedValueOnce({ size: 99 })
    for (let i = 0; i < 2; i++) {
      const res = await call({ chatId: 'c1', tokens: [token()] })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'upload_rejected', reason: 'missing' })
    }
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('records the uploads and returns 201 with summaries', async () => {
    head.mockResolvedValue({ size: 1234, contentType: 'application/pdf' })
    const res = await call({ chatId: 'c1', tokens: [token()] })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      uploads: [{ id: 'up1', filename: 'deck.pdf', mediaType: 'application/pdf', sizeBytes: 1234 }],
    })
    expect(head).toHaveBeenCalledWith('uploads/user1/up1/deck.pdf')
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'up1', userId: 'user1', chatId: 'c1', storageKey: 'uploads/user1/up1/deck.pdf' }),
    ])
  })
})
