import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } }))
vi.mock('@/lib/db', () => ({ db: { insert: vi.fn() } }))

import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { getOwnedChat } from '@/server/chats'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const call = (build: (form: FormData) => void) => {
  const form = new FormData()
  build(form)
  return POST(new Request('http://localhost/api/uploads', { method: 'POST', body: form }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(storage.put).mockResolvedValue(undefined)
  vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) } as never)
})

describe('POST /api/uploads', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call((f) => f.set('chatId', 'c1'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 404 when chat is not owned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call((f) => {
      f.set('chatId', 'c1')
      f.append('files', new File(['x'], 'a.txt', { type: 'text/plain' }))
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
  })

  it('returns 400 invalid_body without chatId or files', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    const noChat = await call((f) => f.append('files', new File(['x'], 'a.txt', { type: 'text/plain' })))
    expect(noChat.status).toBe(400)
    expect(await noChat.json()).toEqual({ error: 'invalid_body' })
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const noFiles = await call((f) => f.set('chatId', 'c1'))
    expect(noFiles.status).toBe(400)
    expect(await noFiles.json()).toEqual({ error: 'invalid_body' })
  })

  it('rejects a bad upload with 400 before any storage write', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const res = await call((f) => {
      f.set('chatId', 'c1')
      f.append('files', new File(['ok'], 'a.txt', { type: 'text/plain' }))
      f.append('files', new File(['MZ'], 'evil.exe', { type: 'application/x-msdownload' }))
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'upload_rejected', reason: 'bad_type' })
    expect(storage.put).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('stores files and returns 201 with summaries', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const res = await call((f) => {
      f.set('chatId', 'c1')
      f.append('files', new File(['# hi'], 'notes.md', { type: '' }))
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { uploads: Array<Record<string, unknown>> }
    expect(body.uploads).toEqual([
      { id: expect.any(String), filename: 'notes.md', mediaType: 'text/markdown', sizeBytes: 4 },
    ])
    expect(storage.put).toHaveBeenCalledTimes(1)
    const [key, bytes, type] = vi.mocked(storage.put).mock.calls[0]!
    expect(key.startsWith('uploads/user1/')).toBe(true)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(type).toBe('text/markdown')
  })
})
