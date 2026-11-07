import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://opinions.example' } }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/share', () => ({ createShareLink: vi.fn(), revokeShareLink: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { createShareLink, revokeShareLink } from '@/server/share'
import { sessionUser } from '@/test/session-user'
import { DELETE, POST } from './route'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'
const ctx = { params: Promise.resolve({ id: 'c1' }) }
const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/chats/c1/run/share', {
    method,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe.each([
  ['POST', POST],
  ['DELETE', DELETE],
])('%s /api/chats/[id]/run/share auth', (method, handler) => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await handler(req(method), ctx)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 404 for a chat the user does not own', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await handler(req(method), ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(createShareLink).not.toHaveBeenCalled()
    expect(revokeShareLink).not.toHaveBeenCalled()
  })
})

describe('POST /api/chats/[id]/run/share', () => {
  it('creates or returns the link for the latest run with a summary', async () => {
    owned()
    vi.mocked(createShareLink).mockResolvedValue(TOKEN)
    const res = await POST(req('POST'), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ token: TOKEN, url: `https://opinions.example/r/${TOKEN}` })
    expect(createShareLink).toHaveBeenCalledWith('c1', {})
  })

  it('passes a chosen run or message through', async () => {
    owned()
    vi.mocked(createShareLink).mockResolvedValue(TOKEN)
    await POST(req('POST', { runId: 'r1', messageId: 'm1', extra: 1 }), ctx)
    expect(createShareLink).toHaveBeenCalledWith('c1', { runId: 'r1', messageId: 'm1' })
  })

  it('rejects a malformed body', async () => {
    owned()
    const res = await POST(req('POST', { runId: 5 }), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_request' })
    expect((await POST(req('POST', '{'), ctx)).status).toBe(400)
    expect(createShareLink).not.toHaveBeenCalled()
  })

  it('returns 409 when no run of the chat has a summary', async () => {
    owned()
    vi.mocked(createShareLink).mockResolvedValue(null)
    const res = await POST(req('POST'), ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'no_summary' })
  })
})

describe('DELETE /api/chats/[id]/run/share', () => {
  it('revokes the link', async () => {
    owned()
    vi.mocked(revokeShareLink).mockResolvedValue(true)
    const res = await DELETE(req('DELETE', { messageId: 'm1' }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revoked: true })
    expect(revokeShareLink).toHaveBeenCalledWith('c1', { messageId: 'm1' })
  })

  it('returns 409 when no run of the chat has a summary', async () => {
    owned()
    vi.mocked(revokeShareLink).mockResolvedValue(false)
    const res = await DELETE(req('DELETE'), ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'no_summary' })
  })
})
