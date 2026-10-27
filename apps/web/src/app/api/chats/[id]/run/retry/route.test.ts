import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({
  runStore: { getActiveByChat: vi.fn(), getLatestByChat: vi.fn() },
  RunActiveError: class RunActiveError extends Error {},
  RunNotFailedError: class RunNotFailedError extends Error {},
}))
vi.mock('@/server/retry', () => ({ retryRun: vi.fn() }))
vi.mock('@/server/limits', () => ({ getLimits: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { retryRun } from '@/server/retry'
import { runStore } from '@/server/runs'
import { POST } from './route'

const call = () =>
  POST(new Request('http://localhost/api/chats/c1/run/retry', { method: 'POST' }), {
    params: Promise.resolve({ id: 'c1' }),
  })

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

const limits = (over: Partial<ReturnType<typeof getLimits>> = {}) =>
  vi
    .mocked(getLimits)
    .mockReturnValue({ demoMode: false, paused: false, maxRunsPerDay: 2, maxRounds: 40, allowPause: true, ...over })

beforeEach(() => {
  vi.resetAllMocks()
  limits()
})

describe('POST /api/chats/[id]/run/retry', () => {
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
    expect(retryRun).not.toHaveBeenCalled()
  })

  it('returns 409 run_active when a run is active', async () => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', status: 'running' } as never)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_active' })
    expect(retryRun).not.toHaveBeenCalled()
  })

  it('returns 409 run_not_failed when the latest run is done', async () => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_not_failed' })
    expect(retryRun).not.toHaveBeenCalled()
  })

  it('retries a failed run', async () => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'failed' } as never)
    vi.mocked(retryRun).mockResolvedValue({ run: { id: 'r2' } as never, assistantMessageId: 'a2' })
    const res = await call()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ runId: 'r2', assistantMessageId: 'a2' })
    expect(retryRun).toHaveBeenCalledWith({ chatId: 'c1', userId: 'user1' })
  })

  it('returns 409 demo_paused when the demo is paused', async () => {
    owned()
    limits({ paused: true })
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'failed' } as never)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'demo_paused' })
    expect(runStore.getLatestByChat).not.toHaveBeenCalled()
    expect(retryRun).not.toHaveBeenCalled()
  })

  it('checks ownership before the pause', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    limits({ paused: true })
    const res = await call()
    expect(res.status).toBe(404)
  })
})
