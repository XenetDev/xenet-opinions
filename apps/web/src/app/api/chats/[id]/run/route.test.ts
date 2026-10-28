import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({
  runStore: { getLatestByChat: vi.fn(), lastSeq: vi.fn(), queuePosition: vi.fn(), hasPausedRunning: vi.fn() },
}))

import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'
import { sessionUser } from '@/test/session-user'
import { GET } from './route'

const call = () => GET(new Request('http://localhost/api/chats/c1/run'), { params: Promise.resolve({ id: 'c1' }) })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GET /api/chats/[id]/run', () => {
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
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(runStore.getLatestByChat).not.toHaveBeenCalled()
  })

  it('returns status none when the chat has no runs', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'none' })
  })

  it('returns the latest run with its last event seq', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({
      id: 'r1',
      status: 'running',
      stage: 'graph_build',
      assistantMessageId: 'a1',
      envState: 'open',
      envKeepaliveUntil: new Date('2026-10-21T10:00:00.000Z'),
      config: { requirement: 'secret' },
    } as never)
    vi.mocked(runStore.lastSeq).mockResolvedValue(7)
    vi.mocked(runStore.queuePosition).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      runId: 'r1',
      status: 'running',
      stage: 'graph_build',
      assistantMessageId: 'a1',
      lastSeq: 7,
      envState: 'open',
      envKeepaliveUntil: '2026-10-21T10:00:00.000Z',
      queuePosition: null,
      reportRequested: false,
      pausedAhead: false,
    })
    expect(runStore.lastSeq).toHaveBeenCalledWith('r1')
    expect(runStore.hasPausedRunning).not.toHaveBeenCalled()
  })

  it('narrows unknown env state to none and null deadline', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({
      id: 'r1',
      status: 'done',
      stage: 'report',
      assistantMessageId: 'a1',
      envState: 'weird',
      envKeepaliveUntil: null,
    } as never)
    vi.mocked(runStore.lastSeq).mockResolvedValue(1)
    const json = await (await call()).json()
    expect(json.envState).toBe('none')
    expect(json.envKeepaliveUntil).toBeNull()
  })

  it('reports the queue position of a queued run', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({
      id: 'r1',
      status: 'queued',
      stage: 'ontology',
      assistantMessageId: 'a1',
      envState: 'none',
      envKeepaliveUntil: null,
    } as never)
    vi.mocked(runStore.lastSeq).mockResolvedValue(0)
    vi.mocked(runStore.queuePosition).mockResolvedValue(2)
    expect((await (await call()).json()).queuePosition).toBe(2)
    expect(runStore.queuePosition).toHaveBeenCalledWith('r1')
  })

  it('reports pausedAhead for a queued run behind a paused run', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({
      id: 'r1',
      status: 'queued',
      stage: 'ontology',
      assistantMessageId: 'a1',
      cursors: {},
      envState: 'none',
      envKeepaliveUntil: null,
    } as never)
    vi.mocked(runStore.lastSeq).mockResolvedValue(0)
    vi.mocked(runStore.queuePosition).mockResolvedValue(2)
    vi.mocked(runStore.hasPausedRunning).mockResolvedValue(true)
    expect((await (await call()).json()).pausedAhead).toBe(true)
  })

  it('reports stage interviews and reportRequested from cursors', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({
      id: 'r1',
      status: 'running',
      stage: 'interviews',
      assistantMessageId: 'a1',
      cursors: { reportRequested: true },
      envState: 'open',
      envKeepaliveUntil: null,
    } as never)
    vi.mocked(runStore.lastSeq).mockResolvedValue(9)
    vi.mocked(runStore.queuePosition).mockResolvedValue(null)
    const json = await (await call()).json()
    expect(json).toMatchObject({ stage: 'interviews', reportRequested: true, pausedAhead: false })
  })
})
