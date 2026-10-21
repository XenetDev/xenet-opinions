import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ createChat: vi.fn(), listChats: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { createChat, listChats } from '@/server/chats'
import { GET, POST } from './route'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GET /api/chats', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/chats'))
    expect(res.status).toBe(401)
    expect(listChats).not.toHaveBeenCalled()
  })

  it('returns the owned chats in the order listChats gives them', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    const updatedAt = new Date('2026-01-02T00:00:00Z')
    vi.mocked(listChats).mockResolvedValue([
      { id: 'c2', title: 'Newer', updatedAt, runStatus: 'running' },
      { id: 'c1', title: '', updatedAt: new Date('2026-01-01T00:00:00Z'), runStatus: 'none' },
    ])
    const res = await GET(new Request('http://localhost/api/chats'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { chats: Array<{ id: string; updatedAt: string; runStatus: string }> }
    expect(body.chats.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(body.chats[0]).toEqual({ id: 'c2', title: 'Newer', updatedAt: updatedAt.toISOString(), runStatus: 'running' })
    expect(listChats).toHaveBeenCalledWith('user1')
  })
})

describe('POST /api/chats', () => {
  it('creates a chat', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(createChat).mockResolvedValue({ id: 'c9' } as never)
    const res = await POST(new Request('http://localhost/api/chats', { method: 'POST' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'c9' })
  })
})
