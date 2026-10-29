import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { get: vi.fn() } }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({ runStore: { getLatestByChat: vi.fn() }, runsStartedSince: vi.fn() }))
vi.mock('@/server/limits', () => ({ getLimits: vi.fn() }))
vi.mock('@/server/uploads', () => ({ readOwnedUploads: vi.fn() }))
vi.mock('@/server/readiness/check', () => ({ checkReadiness: vi.fn() }))
vi.mock('@/server/readiness/rate-limit', () => ({ allowCheck: vi.fn() }))
vi.mock('@/server/readiness/document-text', () => ({ documentText: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { storage } from '@/lib/storage'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { checkReadiness } from '@/server/readiness/check'
import { documentText } from '@/server/readiness/document-text'
import { allowCheck } from '@/server/readiness/rate-limit'
import { runStore, runsStartedSince } from '@/server/runs'
import { readOwnedUploads } from '@/server/uploads'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const newId = 'Abcdefgh12345678'
const call = (body: unknown, id = 'c1') =>
  POST(
    new Request(`http://localhost/api/chats/${id}/readiness`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )

const limits = (over: Partial<ReturnType<typeof getLimits>> = {}) =>
  vi.mocked(getLimits).mockReturnValue({
    demoMode: false,
    paused: false,
    maxRunsPerDay: 2,
    signedInMaxRunsPerDay: 5,
    anonymous: true,
    maxRounds: 10,
    allowPause: true,
    ...over,
  })

const upload = (id: string, filename = `${id}.txt`, mediaType = 'text/plain') => ({
  id,
  filename,
  mediaType,
  storageKey: `k/${id}`,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
  vi.mocked(readOwnedUploads).mockResolvedValue([])
  vi.mocked(allowCheck).mockReturnValue(true)
  vi.mocked(checkReadiness).mockResolvedValue({ ready: true })
  vi.mocked(storage.get).mockResolvedValue(new Uint8Array([1]))
  vi.mocked(documentText).mockImplementation(async (f) => `text of ${f.filename}`)
  vi.mocked(runsStartedSince).mockResolvedValue({ count: 0, oldestQueuedAt: null })
  limits()
})

describe('POST /api/chats/:id/readiness', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await call({ text: 'x', uploadIds: [] })).status).toBe(401)
  })

  it('returns 404 for an unowned non-chat id', async () => {
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    expect((await call({ text: 'x', uploadIds: [] })).status).toBe(404)
  })

  it('returns 400 for a malformed body', async () => {
    for (const body of ['nope', {}, { text: 'x' }, { retry: false }]) {
      const res = await call(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_body' })
    }
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('returns 409 demo_paused without checking', async () => {
    limits({ paused: true })
    const res = await call({ text: 'x', uploadIds: [] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'demo_paused' })
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('returns 429 with resetAt when out of quota', async () => {
    limits({ demoMode: true })
    const oldest = new Date(Date.now() - 60_000)
    vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: oldest })
    const res = await call({ text: 'x', uploadIds: [] })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string; resetAt: string }
    expect(body.error).toBe('quota_exceeded')
    expect(new Date(body.resetAt).getTime()).toBe(oldest.getTime() + 24 * 60 * 60 * 1000)
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('returns 400 when uploads are not all owned', async () => {
    vi.mocked(readOwnedUploads).mockResolvedValue([upload('u1')])
    const res = await call({ text: 'x', uploadIds: ['u1', 'u2'] })
    expect(res.status).toBe(400)
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('passes the text and each document text to the check', async () => {
    vi.mocked(readOwnedUploads).mockResolvedValue([upload('u1'), upload('u2')])
    vi.mocked(checkReadiness).mockResolvedValue({
      ready: false,
      draft: { background: 'b', actors: 'a', change: 'c' },
    })
    const res = await call({ text: 'brief', uploadIds: ['u1', 'u2', 'u1'] })
    expect(await res.json()).toEqual({ ready: false, draft: { background: 'b', actors: 'a', change: 'c' } })
    expect(readOwnedUploads).toHaveBeenCalledWith({ chatId: 'c1', userId: 'user1', uploadIds: ['u1', 'u2'] })
    expect(checkReadiness).toHaveBeenCalledWith({
      text: 'brief',
      documents: [
        { filename: 'u1.txt', text: 'text of u1.txt' },
        { filename: 'u2.txt', text: 'text of u2.txt' },
      ],
    })
  })

  it('treats an unreadable document as empty text and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(readOwnedUploads).mockResolvedValue([upload('u1')])
    vi.mocked(storage.get).mockRejectedValue(new Error('missing'))
    const res = await call({ text: 'brief', uploadIds: ['u1'] })
    expect(res.status).toBe(200)
    expect(checkReadiness).toHaveBeenCalledWith({ text: 'brief', documents: [{ filename: 'u1.txt', text: '' }] })
    expect(logged).toHaveBeenCalledTimes(1)
    expect(logged.mock.calls[0]?.[0]).toBe('readiness document read failed')
    logged.mockRestore()
  })

  it('stops waiting for documents after 6 seconds and checks with what it has', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(readOwnedUploads).mockResolvedValue([upload('u1'), upload('u2')])
      vi.mocked(storage.get).mockImplementation((key) =>
        key === 'k/u2' ? new Promise(() => {}) : Promise.resolve(new Uint8Array([1])),
      )
      const res = call({ text: 'brief', uploadIds: ['u1', 'u2'] })
      await vi.advanceTimersByTimeAsync(6000)
      expect((await res).status).toBe(200)
      expect(checkReadiness).toHaveBeenCalledWith({
        text: 'brief',
        documents: [
          { filename: 'u1.txt', text: 'text of u1.txt' },
          { filename: 'u2.txt', text: '' },
        ],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns 400 for more than five uploads', async () => {
    const res = await call({ text: 'x', uploadIds: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(readOwnedUploads).not.toHaveBeenCalled()
  })

  it('returns 400 for text over 20 000 characters', async () => {
    const res = await call({ text: 'x'.repeat(20_001), uploadIds: [] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('works for a new chat with no uploads', async () => {
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call({ text: 'brief', uploadIds: [] }, newId)
    expect(res.status).toBe(200)
    expect(checkReadiness).toHaveBeenCalledWith({ text: 'brief', documents: [] })
  })

  it('opens the unfilled card for a short prompt without documents when over the rate limit', async () => {
    vi.mocked(allowCheck).mockReturnValue(false)
    const res = await call({ text: 'brief', uploadIds: [] })
    expect(await res.json()).toEqual({ ready: false, draft: { background: '', actors: '', change: '' } })
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  it('answers ready without checking when over the rate limit with documents or a long prompt', async () => {
    vi.mocked(allowCheck).mockReturnValue(false)
    vi.mocked(readOwnedUploads).mockResolvedValue([upload('u1')])
    expect(await (await call({ text: 'brief', uploadIds: ['u1'] })).json()).toEqual({ ready: true })
    vi.mocked(readOwnedUploads).mockResolvedValue([])
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    expect(await (await call({ text: long, uploadIds: [] })).json()).toEqual({ ready: true })
    expect(checkReadiness).not.toHaveBeenCalled()
  })

  describe('retry', () => {
    const failedRun = (over: Record<string, unknown> = {}) => ({
      id: 'r1',
      status: 'failed',
      error: { stage: 'ontology', code: 'no_actors', message: 'm' },
      config: { requirement: 'the ask', maxRounds: 3, uploadIds: ['u1', 's1'] },
      ...over,
    })

    it('re-checks the original brief without the seed, forced and ungated by quota', async () => {
      limits({ demoMode: true })
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: new Date() })
      vi.mocked(runStore.getLatestByChat).mockResolvedValue(failedRun() as never)
      vi.mocked(readOwnedUploads).mockResolvedValue([upload('u1'), upload('s1', 'seed.md', 'text/markdown')])
      const res = await call({ retry: true })
      expect(res.status).toBe(200)
      expect(checkReadiness).toHaveBeenCalledWith({
        text: 'the ask',
        documents: [{ filename: 'u1.txt', text: 'text of u1.txt' }],
        force: true,
      })
      expect(runsStartedSince).not.toHaveBeenCalled()
    })

    it('is still blocked while paused', async () => {
      limits({ paused: true })
      expect((await call({ retry: true })).status).toBe(409)
      expect(checkReadiness).not.toHaveBeenCalled()
    })

    it('returns 409 run_not_failed for any other latest run', async () => {
      for (const run of [
        null,
        failedRun({ status: 'done', error: null }),
        failedRun({ error: { stage: 'ontology', code: 'other', message: 'm' } }),
      ]) {
        vi.mocked(runStore.getLatestByChat).mockResolvedValue(run as never)
        const res = await call({ retry: true })
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: 'run_not_failed' })
      }
      expect(checkReadiness).not.toHaveBeenCalled()
    })
  })
})
