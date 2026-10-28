import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({ runStore: { getActiveByChat: vi.fn(), transition: vi.fn() } }))

import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const call = () =>
  POST(new Request('http://localhost/api/chats/c1/run/report', { method: 'POST' }), {
    params: Promise.resolve({ id: 'c1' }),
  })

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/chats/[id]/run/report', () => {
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
    expect(runStore.getActiveByChat).not.toHaveBeenCalled()
  })

  it('requests the report for a run paused for interviews', async () => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', status: 'running', stage: 'interviews' } as never)
    const res = await call()
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(runStore.getActiveByChat).toHaveBeenCalledWith('c1')
    expect(runStore.transition).toHaveBeenCalledWith('r1', { cursors: { reportRequested: true } }, [], undefined, {
      expect: expect.any(Function),
    })
    const { expect: guard } = vi.mocked(runStore.transition).mock.calls[0]![4]!
    expect(guard!({ stage: 'interviews' } as never)).toBe(true)
    expect(guard!({ stage: 'report' } as never)).toBe(false)
  })

  it('returns 409 run_not_paused when the run advanced before the write', async () => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', status: 'running', stage: 'interviews' } as never)
    vi.mocked(runStore.transition).mockRejectedValue(new Error('run_not_active'))
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_not_paused' })
  })

  it('rethrows unexpected store errors', async () => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', status: 'running', stage: 'interviews' } as never)
    vi.mocked(runStore.transition).mockRejectedValue(new Error('boom'))
    await expect(call()).rejects.toThrow('boom')
  })

  it.each([
    ['no active run', null],
    ['an active run in another stage', { id: 'r1', status: 'running', stage: 'sim_run' }],
  ])('returns 409 run_not_paused for %s', async (_, active) => {
    owned()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue(active as never)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_not_paused' })
    expect(runStore.transition).not.toHaveBeenCalled()
  })
})
