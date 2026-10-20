import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({
  getOwnedChat: vi.fn(),
  appendMessage: vi.fn(),
  updateMessageParts: vi.fn(),
}))

import { getSessionUser } from '@/lib/session'
import { appendMessage, getOwnedChat, updateMessageParts } from '@/server/chats'
import { POST } from './route'

const userMessage = (text: string) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] })
const call = (message: unknown) =>
  POST(
    new Request('http://localhost/api/chats/c1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'c1', message }),
    }),
    { params: Promise.resolve({ id: 'c1' }) },
  )

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(appendMessage).mockResolvedValue({} as never)
  vi.mocked(updateMessageParts).mockResolvedValue(undefined)
})

describe('POST /api/chats/[id]/messages', () => {
  it('returns 401 json when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call(userMessage('hello'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 404 when chat is not owned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call(userMessage('hello'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
  })

  it('returns 400 on whitespace-only text and writes nothing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const res = await call(userMessage('   \n '))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'empty_message' })
    expect(appendMessage).not.toHaveBeenCalled()
  })

  it('streams text/event-stream for a valid message', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
    expect(appendMessage).toHaveBeenCalledTimes(2)
    expect(appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ chatId: 'c1', id: 'u1', role: 'user' }))
    expect(appendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ chatId: 'c1', role: 'assistant', parts: [] }))
    const body = await res.text()
    expect(body).toContain('You said: ')
    await vi.waitFor(() => expect(updateMessageParts).toHaveBeenCalledTimes(1))
  })
})
