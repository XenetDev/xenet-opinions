import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({
  cancelActiveRun: vi.fn(),
  RunNotActiveError: class RunNotActiveError extends Error {},
  RunNotFoundError: class RunNotFoundError extends Error {},
}))

import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { cancelActiveRun, RunNotActiveError, RunNotFoundError } from '@/server/runs'
import { POST } from './route'

const call = () =>
  POST(new Request('http://localhost/api/chats/c1/run/cancel', { method: 'POST' }), {
    params: Promise.resolve({ id: 'c1' }),
  })

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/chats/[id]/run/cancel', () => {
  it('returns 401 json when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 404 json when the chat is not owned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(cancelActiveRun).not.toHaveBeenCalled()
  })

  it('cancels the active run', async () => {
    owned()
    vi.mocked(cancelActiveRun).mockResolvedValue({ id: 'r1', status: 'cancelled' } as never)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ runId: 'r1' })
    expect(cancelActiveRun).toHaveBeenCalledWith('c1')
  })

  it('returns 409 run_not_active when the latest run is terminal', async () => {
    owned()
    vi.mocked(cancelActiveRun).mockRejectedValue(new RunNotActiveError())
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_not_active' })
  })

  it('returns 404 when the chat has no run', async () => {
    owned()
    vi.mocked(cancelActiveRun).mockRejectedValue(new RunNotFoundError())
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})
