import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { BETTER_AUTH_SECRET: 's'.repeat(32), STORAGE_DIRECT_UPLOADS: '1' } }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ ensureOwnedChat: vi.fn(), getOwnedChat: vi.fn() }))
vi.mock('@/lib/storage', () => ({
  storage: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), presignPut: vi.fn() as unknown },
}))

import { env } from '@/env'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { ensureOwnedChat, getOwnedChat } from '@/server/chats'
import { verifyUploadToken } from '@/server/upload-token'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const mutableStorage = storage as { presignPut?: unknown }
const presignPut = vi.fn()
const pdf = { name: 'deck.pdf', type: 'application/pdf', size: 20 * 1024 * 1024 }

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/uploads/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.resetAllMocks()
  mutableStorage.presignPut = presignPut
  env.STORAGE_DIRECT_UPLOADS = '1'
  presignPut.mockImplementation(async (key: string) => ({
    url: `https://bucket.example/${key}?X-Amz-Signature=abc`,
    headers: { 'content-type': 'application/pdf' },
  }))
})

describe('POST /api/uploads/sign', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call({ chatId: 'c1', files: [pdf] })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 400 invalid_body for a malformed body', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    for (const body of ['nope', { chatId: 'c1' }, { chatId: 'c1', files: [] }, { files: [pdf] }]) {
      const res = await call(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
    }
  })

  it('returns 404 for an unowned non-chat id', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call({ chatId: 'c1', files: [pdf] })
    expect(res.status).toBe(404)
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
  })

  it('rejects a bad upload before signing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const res = await call({ chatId: 'c1', files: [{ ...pdf, size: 51 * 1024 * 1024 }] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'upload_rejected', reason: 'too_large' })
    expect(presignPut).not.toHaveBeenCalled()
  })

  it('answers form mode when the storage cannot presign', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    mutableStorage.presignPut = undefined
    const res = await call({ chatId: 'c1', files: [pdf] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'form' })
  })

  it('answers form mode when direct uploads are switched off', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    env.STORAGE_DIRECT_UPLOADS = '0'
    const res = await call({ chatId: 'c1', files: [pdf] })
    expect(await res.json()).toEqual({ mode: 'form' })
    expect(presignPut).not.toHaveBeenCalled()
  })

  it('signs each file and returns tokens bound to the user and chat', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const res = await call({ chatId: 'c1', files: [pdf, { name: 'notes.md', type: '', size: 4 }] })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      mode: string
      uploads: Array<{ token: string; url: string; headers: Record<string, string> }>
    }
    expect(body.mode).toBe('direct')
    expect(body.uploads).toHaveLength(2)
    const [first, second] = body.uploads.map((u) => verifyUploadToken(u.token)!)
    expect(first).toMatchObject({ userId: 'user1', chatId: 'c1', name: 'deck.pdf', mediaType: 'application/pdf' })
    expect(first!.size).toBe(pdf.size)
    expect(first!.key).toBe(`uploads/user1/${first!.id}/deck.pdf`)
    expect(first!.exp).toBeGreaterThan(Date.now() + 9 * 60_000)
    expect(second).toMatchObject({ name: 'notes.md', mediaType: 'text/markdown', size: 4 })
    expect(first!.id).not.toBe(second!.id)
    expect(presignPut).toHaveBeenCalledWith(first!.key, {
      contentType: 'application/pdf',
      contentLength: pdf.size,
      expiresInSeconds: 600,
    })
    expect(body.uploads[0]).toMatchObject({
      url: `https://bucket.example/${first!.key}?X-Amz-Signature=abc`,
      headers: { 'content-type': 'application/pdf' },
    })
  })

  it('creates the chat for a fresh client id and refuses a foreign one', async () => {
    const newId = 'Abcdefgh12345678'
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    vi.mocked(ensureOwnedChat)
      .mockResolvedValueOnce({ id: newId } as never)
      .mockResolvedValueOnce(null)
    expect((await call({ chatId: newId, files: [pdf] })).status).toBe(200)
    expect(ensureOwnedChat).toHaveBeenCalledWith(newId, 'user1')
    expect((await call({ chatId: newId, files: [pdf] })).status).toBe(404)
  })
})
