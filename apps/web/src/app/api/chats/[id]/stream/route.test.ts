import { createUIMessageStream } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({ runStore: { getActiveByChat: vi.fn() } }))
vi.mock('@xo/engine', () => ({ tailRunAsUIMessageStream: vi.fn() }))

import { tailRunAsUIMessageStream } from '@xo/engine'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'
import { GET } from './route'

const call = (request = new Request('http://localhost/api/chats/c1/stream')) => GET(request, { params: Promise.resolve({ id: 'c1' }) })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GET /api/chats/[id]/stream', () => {
  it('returns 401 json when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
    expect(runStore.getActiveByChat).not.toHaveBeenCalled()
  })

  it('returns 404 json, not an event stream, for a chat the user does not own', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toMatch(/text\/event-stream/)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(runStore.getActiveByChat).not.toHaveBeenCalled()
  })

  it('returns 204 with an empty body when no run is active', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(res.headers.get('content-type')).toBeNull()
    expect(tailRunAsUIMessageStream).not.toHaveBeenCalled()
  })

  it('tails the active run starting with the assistant message id', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', assistantMessageId: 'a1' } as never)
    vi.mocked(tailRunAsUIMessageStream).mockImplementation(({ messageId }) =>
      createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: 'start', messageId })
        },
      }),
    )
    const controller = new AbortController()
    const request = new Request('http://localhost/api/chats/c1/stream', { signal: controller.signal })
    const res = await call(request)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
    expect(tailRunAsUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({ store: runStore, runId: 'r1', messageId: 'a1', maxDurationMs: 280_000 }),
    )
    expect(vi.mocked(tailRunAsUIMessageStream).mock.calls[0]![0].signal).toBe(request.signal)
    const first = (await res.text()).split('\n').find((line) => line.startsWith('data:'))
    expect(JSON.parse(first!.slice(5).trim())).toEqual({ type: 'start', messageId: 'a1' })
  })
})
