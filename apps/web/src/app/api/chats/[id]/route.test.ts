import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn(), renameChat: vi.fn(), deleteChat: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { deleteChat, getOwnedChat, renameChat } from '@/server/chats'
import { DELETE, PATCH } from './route'

const params = { params: Promise.resolve({ id: 'c1' }) }
const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/chats/c1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params,
  )
const del = () => DELETE(new Request('http://localhost/api/chats/c1', { method: 'DELETE' }), params)

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('PATCH /api/chats/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await patch({ title: 'x' })).status).toBe(401)
  })

  it('returns 404 when not owned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await patch({ title: 'x' })
    expect(res.status).toBe(404)
    expect(renameChat).not.toHaveBeenCalled()
  })

  it.each([[''], ['   '], ['a'.repeat(121)]])('returns 400 invalid_body for %j', async (title) => {
    owned()
    const res = await patch({ title })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(renameChat).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed json', async () => {
    owned()
    expect((await patch('{')).status).toBe(400)
  })

  it('renames with the trimmed title', async () => {
    owned()
    const res = await patch({ title: '  Hello  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'c1', title: 'Hello' })
    expect(renameChat).toHaveBeenCalledWith('c1', 'Hello')
  })

  it('accepts exactly 120 chars', async () => {
    owned()
    expect((await patch({ title: 'a'.repeat(120) })).status).toBe(200)
  })
})

describe('DELETE /api/chats/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await del()).status).toBe(401)
  })

  it('returns 404 when not owned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    expect((await del()).status).toBe(404)
    expect(deleteChat).not.toHaveBeenCalled()
  })

  it('deletes and returns 204', async () => {
    owned()
    const res = await del()
    expect(res.status).toBe(204)
    expect(deleteChat).toHaveBeenCalledWith('c1')
  })
})
