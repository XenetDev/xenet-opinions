import { createUIMessageStream } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({
  runStore: { getActiveByChat: vi.fn(), getLatestByChat: vi.fn(), queuePosition: vi.fn(), hasPausedRunning: vi.fn() },
}))
vi.mock('@xo/engine', () => ({ tailRunAsUIMessageStream: vi.fn() }))

import { tailRunAsUIMessageStream } from '@xo/engine'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'
import { sessionUser } from '@/test/session-user'
import { GET } from './route'

const call = (request = new Request('http://localhost/api/chats/c1/stream')) =>
  GET(request, { params: Promise.resolve({ id: 'c1' }) })

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
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toMatch(/text\/event-stream/)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(runStore.getActiveByChat).not.toHaveBeenCalled()
  })

  it('returns 204 with an empty body when no run is active', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(res.headers.get('content-type')).toBeNull()
    expect(tailRunAsUIMessageStream).not.toHaveBeenCalled()
    expect(runStore.getLatestByChat).not.toHaveBeenCalled()
  })

  it('tails the active run starting with the assistant message id', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
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
    vi.mocked(runStore.queuePosition).mockResolvedValue(3)
    expect(await vi.mocked(tailRunAsUIMessageStream).mock.calls[0]![0].queuePosition!()).toBe(3)
    expect(runStore.queuePosition).toHaveBeenCalledWith('r1')
    vi.mocked(runStore.hasPausedRunning).mockResolvedValue(true)
    expect(await vi.mocked(tailRunAsUIMessageStream).mock.calls[0]![0].pausedAhead!()).toBe(true)
    const first = (await res.text()).split('\n').find((line) => line.startsWith('data:'))
    expect(JSON.parse(first!.slice(5).trim())).toEqual({ type: 'start', messageId: 'a1' })
  })

  it.each(['x', '-1', '1.5', '', '1e3', '99999999999999999999'])(
    'rejects after=%j with 400 invalid_after',
    async (after) => {
      vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
      vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
      vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', assistantMessageId: 'a1' } as never)
      const res = await call(new Request(`http://localhost/api/chats/c1/stream?after=${after}`))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_after' })
      expect(tailRunAsUIMessageStream).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['?after=42', 42],
    ['?after=0', 0],
    ['', 0],
  ])('tails from the seq in %j', async (query, afterSeq) => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', assistantMessageId: 'a1' } as never)
    vi.mocked(tailRunAsUIMessageStream).mockImplementation(() => createUIMessageStream({ execute: () => {} }))
    const res = await call(new Request(`http://localhost/api/chats/c1/stream${query}`))
    expect(res.status).toBe(200)
    expect(tailRunAsUIMessageStream).toHaveBeenCalledWith(expect.objectContaining({ afterSeq }))
  })

  it('drains the latest run from the cursor when a continuation finds the run already ended', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', assistantMessageId: 'a1' } as never)
    vi.mocked(tailRunAsUIMessageStream).mockImplementation(() => createUIMessageStream({ execute: () => {} }))
    const res = await call(new Request('http://localhost/api/chats/c1/stream?after=7'))
    expect(res.status).toBe(200)
    expect(runStore.getLatestByChat).toHaveBeenCalledWith('c1')
    expect(tailRunAsUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r1', messageId: 'a1', afterSeq: 7 }),
    )
  })

  it('returns 204 for a continuation when the chat has no run', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue(null)
    const res = await call(new Request('http://localhost/api/chats/c1/stream?after=7'))
    expect(res.status).toBe(204)
  })
})
