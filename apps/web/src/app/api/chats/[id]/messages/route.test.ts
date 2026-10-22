import { createUIMessageStream } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => {
  class RunActiveError extends Error {}
  return {
    RunActiveError,
    runStore: { getActiveByChat: vi.fn(), getLatestByChat: vi.fn() },
    countOwnedUploads: vi.fn(),
    startRun: vi.fn(),
  }
})
vi.mock('@/server/follow-up', () => {
  class FollowUpError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return { FollowUpError, runFollowUp: vi.fn() }
})
vi.mock('@xo/engine', () => ({ MAX_INTERVIEW_AGENTS: 5, tailRunAsUIMessageStream: vi.fn() }))

import { tailRunAsUIMessageStream } from '@xo/engine'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { FollowUpError, runFollowUp } from '@/server/follow-up'
import { RunActiveError, countOwnedUploads, runStore, startRun } from '@/server/runs'
import { POST } from './route'

const userMessage = (text: string) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] })
const callBody = (body: unknown) =>
  POST(
    new Request('http://localhost/api/chats/c1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) },
  )
const call = (message: unknown, extra: Record<string, unknown> = {}) => callBody({ id: 'c1', message, ...extra })

const authed = () => {
  vi.mocked(getSessionUser).mockResolvedValue({ id: 'user1' })
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
  vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
  vi.mocked(runStore.getLatestByChat).mockResolvedValue(null)
}

beforeEach(() => {
  vi.resetAllMocks()
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

  it('returns 400 invalid_body for an empty object', async () => {
    authed()
    const res = await callBody({})
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(startRun).not.toHaveBeenCalled()
  })

  it('returns 400 on whitespace-only text and starts nothing', async () => {
    authed()
    const res = await call(userMessage('   \n '))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'empty_message' })
    expect(startRun).not.toHaveBeenCalled()
  })

  it('returns 409 run_active when a run is active and does not start one', async () => {
    authed()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r1', status: 'running' } as never)
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_active' })
    expect(startRun).not.toHaveBeenCalled()
  })

  it('routes a done latest run to runFollowUp and never starts a run', async () => {
    authed()
    const latest = { id: 'r1', status: 'done' }
    vi.mocked(runStore.getLatestByChat).mockResolvedValue(latest as never)
    vi.mocked(runFollowUp).mockResolvedValue(new Response('ok'))
    const res = await call(userMessage('hi'), { target: 'agents', agentIds: ['a1'], uploadIds: ['foreign'] })
    expect(res.status).toBe(200)
    expect(startRun).not.toHaveBeenCalled()
    expect(countOwnedUploads).not.toHaveBeenCalled()
    expect(runFollowUp).toHaveBeenCalledWith({
      chat: { id: 'c1' },
      run: latest,
      userMessage: { id: 'u1', parts: [{ type: 'text', text: 'hi' }] },
      text: 'hi',
      target: 'agents',
      agentIds: ['a1'],
    })
  })

  it('defaults follow-up target to report', async () => {
    authed()
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
    vi.mocked(runFollowUp).mockResolvedValue(new Response('ok'))
    await call(userMessage('hi'))
    expect(runFollowUp).toHaveBeenCalledWith(expect.objectContaining({ target: 'report', agentIds: [] }))
  })

  it.each([
    ['invalid_body', 400],
    ['env_closed', 409],
    ['follow_up_unavailable', 409],
  ])('maps FollowUpError %s to %i', async (code, status) => {
    authed()
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
    vi.mocked(runFollowUp).mockRejectedValue(new FollowUpError(code as never))
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: code })
  })

  it('rethrows unexpected follow-up errors', async () => {
    authed()
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
    vi.mocked(runFollowUp).mockRejectedValue(new Error('boom'))
    await expect(call(userMessage('hi'))).rejects.toThrow('boom')
  })

  it('still returns 409 run_active before follow-up when a run is active', async () => {
    authed()
    vi.mocked(runStore.getActiveByChat).mockResolvedValue({ id: 'r2', status: 'running' } as never)
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(409)
    expect(runFollowUp).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_body when an upload id is not owned by this chat', async () => {
    authed()
    vi.mocked(countOwnedUploads).mockResolvedValue(0)
    const res = await call(userMessage('hi'), { uploadIds: ['foreign'] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(countOwnedUploads).toHaveBeenCalledWith({ chatId: 'c1', userId: 'user1', uploadIds: ['foreign'] })
    expect(startRun).not.toHaveBeenCalled()
  })

  it('returns 400 invalid_body for more than 5 upload ids', async () => {
    authed()
    const res = await call(userMessage('hi'), { uploadIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
    expect(countOwnedUploads).not.toHaveBeenCalled()
    expect(startRun).not.toHaveBeenCalled()
  })

  it('returns 409 run_active when startRun loses the race', async () => {
    authed()
    vi.mocked(startRun).mockRejectedValue(new RunActiveError())
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_active' })
  })

  it('allows a new run after a failed run', async () => {
    authed()
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'failed' } as never)
    vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
    vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(200)
    await res.body?.cancel()
  })

  it('starts a run and streams start with the assistant message id', async () => {
    authed()
    vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
    vi.mocked(tailRunAsUIMessageStream).mockImplementation(({ messageId }) =>
      createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: 'start', messageId })
        },
      }),
    )
    const res = await call(userMessage('hi'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
    expect(startRun).toHaveBeenCalledTimes(1)
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'c1', userId: 'user1', uploadIds: [], maxRounds: 3 }),
    )
    expect(tailRunAsUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r2', messageId: 'a1', maxDurationMs: 280_000 }),
    )
    const body = await res.text()
    const first = body.split('\n').find((line) => line.startsWith('data:'))
    expect(JSON.parse(first!.slice(5).trim())).toEqual({ type: 'start', messageId: 'a1' })
  })
})
