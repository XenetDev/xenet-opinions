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
vi.mock('@/server/uploads', () => ({ createSeedUpload: vi.fn(), readOwnedUploads: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { retryRun } from '@/server/retry'
import { runStore } from '@/server/runs'
import { createSeedUpload, readOwnedUploads } from '@/server/uploads'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const call = (body?: unknown) =>
  POST(
    new Request('http://localhost/api/chats/c1/run/retry', {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id: 'c1' }) },
  )

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

const limits = (over: Partial<ReturnType<typeof getLimits>> = {}) =>
  vi.mocked(getLimits).mockReturnValue({
    demoMode: false,
    paused: false,
    maxRunsPerDay: 2,
    signedInMaxRunsPerDay: 3,
    anonymous: false,
    maxRounds: 40,
    allowPause: true,
    ...over,
  })

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
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
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
    expect(createSeedUpload).not.toHaveBeenCalled()
  })

  describe('with seed answers', () => {
    const failed = (code: string) =>
      vi.mocked(runStore.getLatestByChat).mockResolvedValue({
        id: 'r1',
        status: 'failed',
        config: { requirement: 'Should we raise prices?', maxRounds: 3, uploadIds: ['up1', 'oldseed', 'up2'] },
        error: { stage: 'graph_build', code, message: 'boom' },
      } as never)

    beforeEach(() => {
      owned()
      vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
      vi.mocked(retryRun).mockResolvedValue({ run: { id: 'r2' } as never, assistantMessageId: 'a2' })
      vi.mocked(readOwnedUploads).mockResolvedValue([
        { id: 'up1', filename: 'brief.pdf', mediaType: 'application/pdf', storageKey: 'k1' },
        { id: 'oldseed', filename: 'seed.md', mediaType: 'text/markdown', storageKey: 'k2' },
        { id: 'up2', filename: 'seed.md', mediaType: 'text/plain', storageKey: 'k3' },
      ])
      vi.mocked(createSeedUpload).mockResolvedValue({
        id: 'seed2',
        filename: 'seed.md',
        mediaType: 'text/markdown',
        sizeBytes: 1,
      })
    })

    it('restarts a no-actors failure with the original documents and a new seed', async () => {
      failed('no_actors')
      const res = await call({ seed: { actors: ' Customers ', change: 'A 20% rise' } })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ runId: 'r2', assistantMessageId: 'a2' })
      expect(readOwnedUploads).toHaveBeenCalledWith({
        chatId: 'c1',
        userId: 'user1',
        uploadIds: ['up1', 'oldseed', 'up2'],
      })
      expect(createSeedUpload).toHaveBeenCalledTimes(1)
      const { chatId, userId, document } = vi.mocked(createSeedUpload).mock.calls[0]![0]
      expect({ chatId, userId }).toEqual({ chatId: 'c1', userId: 'user1' })
      expect(document).toContain('# Scenario\n\nShould we raise prices?\n')
      expect(document).toContain('## Who is involved\nCustomers\n')
      expect(document).toContain('## What is changing\nA 20% rise\n')
      expect(retryRun).toHaveBeenCalledWith({
        chatId: 'c1',
        userId: 'user1',
        restart: { uploadIds: ['up1', 'up2', 'seed2'] },
      })
    })

    it('restarts with a generic seed when every answer is empty', async () => {
      failed('no_actors')
      const res = await call({ seed: {} })
      expect(res.status).toBe(201)
      expect(createSeedUpload).toHaveBeenCalledTimes(1)
      expect(retryRun).toHaveBeenCalledWith(
        expect.objectContaining({ restart: { uploadIds: ['up1', 'up2', 'seed2'] } }),
      )
    })

    it('returns 409 run_not_failed for any other failure', async () => {
      failed('api')
      const res = await call({ seed: { actors: 'Customers' } })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'run_not_failed' })
      expect(createSeedUpload).not.toHaveBeenCalled()
      expect(retryRun).not.toHaveBeenCalled()
    })

    it('returns 400 invalid_body for a malformed seed', async () => {
      failed('no_actors')
      const res = await call({ seed: { actors: 3 } })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
      expect(retryRun).not.toHaveBeenCalled()
    })
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
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    limits({ paused: true })
    const res = await call()
    expect(res.status).toBe(404)
  })
})
