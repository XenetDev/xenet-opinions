import { createUIMessageStream } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ ensureOwnedChat: vi.fn(), getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => {
  class RunActiveError extends Error {}
  return {
    RunActiveError,
    runStore: { getActiveByChat: vi.fn(), getLatestByChat: vi.fn(), queuePosition: vi.fn(), hasPausedRunning: vi.fn() },
    countOwnedUploads: vi.fn(),
    runsStartedSince: vi.fn(),
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
vi.mock('@/server/interview-window', () => {
  class InterviewWindowError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return { InterviewWindowError, createInterviewQuestion: vi.fn() }
})
vi.mock('@/server/limits', () => ({ getLimits: vi.fn() }))
vi.mock('@/server/uploads', () => ({ createSeedUpload: vi.fn() }))
vi.mock('@xo/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xo/engine')>()
  return { ...actual, checkRunPolicy: vi.fn(actual.checkRunPolicy), tailRunAsUIMessageStream: vi.fn() }
})

import { checkRunPolicy, tailRunAsUIMessageStream } from '@xo/engine'
import { getSessionUser } from '@/lib/session'
import { ensureOwnedChat, getOwnedChat } from '@/server/chats'
import { FollowUpError, runFollowUp } from '@/server/follow-up'
import { createInterviewQuestion, InterviewWindowError } from '@/server/interview-window'
import { getLimits } from '@/server/limits'
import { countOwnedUploads, RunActiveError, runStore, runsStartedSince, startRun } from '@/server/runs'
import { createSeedUpload } from '@/server/uploads'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const userMessage = (text: string) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] })
const callBody = (body: unknown, id = 'c1') =>
  POST(
    new Request(`http://localhost/api/chats/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
const call = (message: unknown, extra: Record<string, unknown> = {}) =>
  callBody({ id: 'c1', message, uploadIds: ['up1'], ...extra })

const authed = () => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
  vi.mocked(runStore.getActiveByChat).mockResolvedValue(null)
  vi.mocked(runStore.getLatestByChat).mockResolvedValue(null)
  limits()
  vi.mocked(runsStartedSince).mockResolvedValue({ count: 0, oldestQueuedAt: null })
  vi.mocked(countOwnedUploads).mockResolvedValue(1)
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
})

describe('POST /api/chats/[id]/messages', () => {
  it('returns 401 json when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call(userMessage('hello'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 404 when chat is not owned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call(userMessage('hello'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(ensureOwnedChat).not.toHaveBeenCalled()
  })

  describe('a client-provided id', () => {
    const newId = 'Abcdefgh12345678'
    const send = () => callBody({ id: newId, message: userMessage('hi'), uploadIds: ['up1'] }, newId)

    it('creates the chat on first use and starts the run', async () => {
      authed()
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      vi.mocked(countOwnedUploads).mockResolvedValue(1)
      vi.mocked(ensureOwnedChat).mockResolvedValue({ id: newId } as never)
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
      const res = await send()
      expect(res.status).toBe(200)
      expect(ensureOwnedChat).toHaveBeenCalledWith(newId, 'user1')
      expect(runStore.getActiveByChat).not.toHaveBeenCalled()
      expect(countOwnedUploads).toHaveBeenCalledWith({ chatId: newId, userId: 'user1', uploadIds: ['up1'] })
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ chatId: newId, userId: 'user1' }))
    })

    it("returns 404 for another user's id without creating anything", async () => {
      authed()
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      vi.mocked(countOwnedUploads).mockResolvedValue(0)
      const res = await send()
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
      expect(countOwnedUploads).toHaveBeenCalledTimes(1)
      expect(ensureOwnedChat).not.toHaveBeenCalled()
      expect(startRun).not.toHaveBeenCalled()
    })

    it("returns 404 for a new id whose uploads don't match, without creating it", async () => {
      authed()
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      vi.mocked(countOwnedUploads).mockResolvedValue(0)
      const res = await callBody({ id: newId, message: userMessage('hi'), uploadIds: ['up1', 'up2'] }, newId)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
      expect(ensureOwnedChat).not.toHaveBeenCalled()
      expect(startRun).not.toHaveBeenCalled()
    })

    it('returns 404 when the chat cannot be claimed after the uploads check', async () => {
      authed()
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      vi.mocked(ensureOwnedChat).mockResolvedValue(null)
      const res = await send()
      expect(res.status).toBe(404)
      expect(startRun).not.toHaveBeenCalled()
    })

    it('does not create the chat or a seed when the run is refused', async () => {
      authed()
      limits({ demoMode: true })
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: new Date(Date.now() - 60_000) })
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      const res = await callBody({ id: newId, message: userMessage('hi'), uploadIds: [] }, newId)
      expect(res.status).toBe(429)
      expect(await res.json()).toMatchObject({ error: 'quota_exceeded' })
      expect(ensureOwnedChat).not.toHaveBeenCalled()
      expect(createSeedUpload).not.toHaveBeenCalled()
    })

    it("returns 404 for another user's id without uploads and writes no seed", async () => {
      authed()
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      vi.mocked(ensureOwnedChat).mockResolvedValue(null)
      const res = await callBody({ id: newId, message: userMessage('hi'), uploadIds: [] }, newId)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
      expect(countOwnedUploads).not.toHaveBeenCalled()
      expect(createSeedUpload).not.toHaveBeenCalled()
      expect(startRun).not.toHaveBeenCalled()
    })

    it('creates the chat and then the seed for a prompt-only run', async () => {
      authed()
      vi.mocked(getOwnedChat).mockResolvedValue(null)
      vi.mocked(ensureOwnedChat).mockResolvedValue({ id: newId } as never)
      vi.mocked(createSeedUpload).mockResolvedValue({ id: 'seed1' } as never)
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
      const res = await callBody({ id: newId, message: userMessage('hi'), uploadIds: [] }, newId)
      expect(res.status).toBe(200)
      await res.body?.cancel()
      expect(vi.mocked(ensureOwnedChat).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(createSeedUpload).mock.invocationCallOrder[0]!,
      )
      expect(createSeedUpload).toHaveBeenCalledWith(expect.objectContaining({ chatId: newId, userId: 'user1' }))
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ uploadIds: ['seed1'] }))
    })
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

  it('sends a follow-up on a done run without uploads and writes no seed', async () => {
    authed()
    vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
    vi.mocked(runFollowUp).mockResolvedValue(new Response('ok'))
    const res = await call(userMessage('why?'), { uploadIds: [] })
    expect(res.status).toBe(200)
    expect(runFollowUp).toHaveBeenCalledTimes(1)
    expect(startRun).not.toHaveBeenCalled()
    expect(ensureOwnedChat).not.toHaveBeenCalled()
    expect(createSeedUpload).not.toHaveBeenCalled()
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

  describe('prompt-only runs', () => {
    const start = () => {
      vi.mocked(createSeedUpload).mockResolvedValue({
        id: 'seed1',
        filename: 'seed.md',
        mediaType: 'text/markdown',
        sizeBytes: 1,
      })
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
    }

    it('seeds a run without uploads from the question alone', async () => {
      authed()
      start()
      const res = await call(userMessage('Should we raise prices?'), { uploadIds: [] })
      expect(res.status).toBe(200)
      await res.body?.cancel()
      expect(countOwnedUploads).not.toHaveBeenCalled()
      expect(createSeedUpload).toHaveBeenCalledWith({
        chatId: 'c1',
        userId: 'user1',
        document:
          "# Scenario\n\nShould we raise prices?\n\n## Background and constraints\nA present-day, realistic setting for the question above. The people and organisations involved already exist, know each other's positions, and talk about the decision in public.\n\n## Who is involved\n- The people directly affected by the decision, across different ages, budgets and levels of dependence on what is changing\n- The organisation or authority making the decision, including its leadership and front-line staff\n- Organisations with a competing or opposing interest\n- Journalists, analysts and commentators who cover the topic\n- Online communities and social media where the decision is discussed\n\n## What is changing\nThe decision described in the question is announced publicly and takes effect within the next month.\n",
      })
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({ uploadIds: ['seed1'], text: 'Should we raise prices?' }),
      )
    })

    it('writes the seed fields into the document', async () => {
      authed()
      start()
      const res = await call(userMessage('Should we raise prices?'), {
        uploadIds: [],
        seed: { background: ' Small SaaS, 2k customers ', actors: 'Customers', change: 'A 20% rise' },
      })
      await res.body?.cancel()
      const { document } = vi.mocked(createSeedUpload).mock.calls[0]![0]
      expect(document).toContain('## Background and constraints\nSmall SaaS, 2k customers\n')
      expect(document).toContain('## Who is involved\nCustomers\n')
      expect(document).toContain('## What is changing\nA 20% rise\n')
    })

    it('returns 429 when the quota is spent and writes no seed', async () => {
      authed()
      limits({ demoMode: true })
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: new Date(Date.now() - 60_000) })
      const res = await call(userMessage('hi'), { uploadIds: [] })
      expect(res.status).toBe(429)
      expect(checkRunPolicy).toHaveBeenCalledTimes(1)
      expect(createSeedUpload).not.toHaveBeenCalled()
      expect(ensureOwnedChat).not.toHaveBeenCalled()
      expect(startRun).not.toHaveBeenCalled()
    })

    it('does not seed a run that has uploads and no seed answers', async () => {
      authed()
      start()
      const res = await call(userMessage('hi'))
      await res.body?.cancel()
      expect(countOwnedUploads).toHaveBeenCalledWith({ chatId: 'c1', userId: 'user1', uploadIds: ['up1'] })
      expect(createSeedUpload).not.toHaveBeenCalled()
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ uploadIds: ['up1'] }))
    })

    it('does not seed a run that has uploads and only blank seed answers', async () => {
      authed()
      start()
      const res = await call(userMessage('hi'), { seed: { background: '  ', actors: '', change: '\n' } })
      await res.body?.cancel()
      expect(createSeedUpload).not.toHaveBeenCalled()
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ uploadIds: ['up1'] }))
    })

    it('attaches a seed after the uploads when the answers are non-empty', async () => {
      authed()
      start()
      const uploadIds = ['u1', 'u2', 'u3', 'u4', 'u5']
      vi.mocked(countOwnedUploads).mockResolvedValue(5)
      const res = await call(userMessage('Should we raise prices?'), { uploadIds, seed: { actors: 'Customers' } })
      expect(res.status).toBe(200)
      await res.body?.cancel()
      expect(countOwnedUploads).toHaveBeenCalledTimes(1)
      expect(createSeedUpload).toHaveBeenCalledTimes(1)
      const { chatId, userId, document } = vi.mocked(createSeedUpload).mock.calls[0]![0]
      expect({ chatId, userId }).toEqual({ chatId: 'c1', userId: 'user1' })
      expect(document).toContain('Should we raise prices?')
      expect(document).toContain('## Who is involved\nCustomers\n')
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ uploadIds: [...uploadIds, 'seed1'] }))
    })
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
      expect.objectContaining({
        chatId: 'c1',
        userId: 'user1',
        uploadIds: ['up1'],
        maxRounds: 3,
        pauseForInterviews: false,
      }),
    )
    expect(tailRunAsUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r2', messageId: 'a1', maxDurationMs: 280_000 }),
    )
    const body = await res.text()
    const first = body.split('\n').find((line) => line.startsWith('data:'))
    expect(JSON.parse(first!.slice(5).trim())).toEqual({ type: 'start', messageId: 'a1' })
  })

  describe('interview window', () => {
    const paused = { id: 'r1', status: 'running', stage: 'interviews', cursors: {} }

    it('writes interview questions for a paused run and returns 202 json, not a stream', async () => {
      authed()
      vi.mocked(runStore.getActiveByChat).mockResolvedValue(paused as never)
      vi.mocked(createInterviewQuestion).mockResolvedValue({ questionId: 'q1', interviewIds: ['i1', 'i2'] })
      const res = await call(userMessage('why?'), { target: 'agents', agentIds: ['1', '2'] })
      expect(res.status).toBe(202)
      expect(res.headers.get('content-type')).not.toMatch(/event-stream/)
      expect(await res.json()).toEqual({ questionId: 'q1', interviewIds: ['i1', 'i2'] })
      expect(createInterviewQuestion).toHaveBeenCalledWith({ run: paused, agentIds: ['1', '2'], text: 'why?' })
      expect(startRun).not.toHaveBeenCalled()
      expect(tailRunAsUIMessageStream).not.toHaveBeenCalled()
    })

    it('accepts an interview question without uploads and writes no seed', async () => {
      authed()
      vi.mocked(runStore.getActiveByChat).mockResolvedValue(paused as never)
      vi.mocked(createInterviewQuestion).mockResolvedValue({ questionId: 'q1', interviewIds: ['i1'] })
      const res = await call(userMessage('why?'), { target: 'agents', agentIds: ['1'], uploadIds: [] })
      expect(res.status).toBe(202)
      expect(createInterviewQuestion).toHaveBeenCalledTimes(1)
      expect(startRun).not.toHaveBeenCalled()
      expect(createSeedUpload).not.toHaveBeenCalled()
    })

    it('refuses other targets with 409 run_paused', async () => {
      authed()
      vi.mocked(runStore.getActiveByChat).mockResolvedValue(paused as never)
      const res = await call(userMessage('hi'))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'run_paused' })
      expect(createInterviewQuestion).not.toHaveBeenCalled()
      expect(startRun).not.toHaveBeenCalled()
    })

    it.each([
      ['invalid_body', 400],
      ['report_requested', 409],
      ['window_closed', 409],
    ])('maps InterviewWindowError %s to %i', async (code, status) => {
      authed()
      vi.mocked(runStore.getActiveByChat).mockResolvedValue(paused as never)
      vi.mocked(createInterviewQuestion).mockRejectedValue(new InterviewWindowError(code as never))
      const res = await call(userMessage('hi'), { target: 'agents', agentIds: ['1'] })
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error: code })
    })

    it('still returns run_active for an active run in another stage', async () => {
      authed()
      vi.mocked(runStore.getActiveByChat).mockResolvedValue({ ...paused, stage: 'sim_run' } as never)
      const res = await call(userMessage('hi'), { target: 'agents', agentIds: ['1'] })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'run_active' })
      expect(createInterviewQuestion).not.toHaveBeenCalled()
    })
  })

  describe('pause option', () => {
    const start = () => {
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
    }

    it('passes pauseForInterviews through when allowed', async () => {
      authed()
      start()
      const res = await call(userMessage('hi'), { runOptions: { pauseForInterviews: true } })
      await res.body?.cancel()
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ pauseForInterviews: true }))
    })

    it('forces pauseForInterviews false when DEMO_ALLOW_PAUSE is 0', async () => {
      authed()
      limits({ allowPause: false })
      start()
      const res = await call(userMessage('hi'), { runOptions: { pauseForInterviews: true } })
      await res.body?.cancel()
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ pauseForInterviews: false }))
    })

    it('passes a pausedAhead reader to the tail', async () => {
      authed()
      start()
      vi.mocked(runStore.hasPausedRunning).mockResolvedValue(true)
      const res = await call(userMessage('hi'))
      await res.body?.cancel()
      const reader = vi.mocked(tailRunAsUIMessageStream).mock.calls[0]![0].pausedAhead!
      expect(await reader()).toBe(true)
    })
  })

  describe('demo limits', () => {
    it('blocks new runs with 409 demo_paused', async () => {
      authed()
      limits({ paused: true })
      const res = await call(userMessage('hi'))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'demo_paused' })
      expect(startRun).not.toHaveBeenCalled()
    })

    it('still allows follow-ups while paused', async () => {
      authed()
      limits({ paused: true, demoMode: true })
      vi.mocked(runStore.getLatestByChat).mockResolvedValue({ id: 'r1', status: 'done' } as never)
      vi.mocked(runFollowUp).mockResolvedValue(new Response('ok'))
      const res = await call(userMessage('why?'))
      expect(res.status).toBe(200)
      expect(runFollowUp).toHaveBeenCalledTimes(1)
      expect(runsStartedSince).not.toHaveBeenCalled()
    })

    it('returns 429 quota_exceeded with resetAt when the window is full', async () => {
      authed()
      limits({ demoMode: true, maxRounds: 3 })
      const oldest = new Date(Date.now() - 3_600_000)
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: oldest })
      const res = await call(userMessage('hi'))
      expect(res.status).toBe(429)
      expect(await res.json()).toEqual({
        error: 'quota_exceeded',
        resetAt: new Date(oldest.getTime() + 86_400_000).toISOString(),
      })
      expect(startRun).not.toHaveBeenCalled()
    })

    it('starts a run when retry rows leave the distinct-chat count under the limit', async () => {
      authed()
      limits({ demoMode: true, maxRounds: 3 })
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 1, oldestQueuedAt: new Date(Date.now() - 3_600_000) })
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
      const res = await call(userMessage('hi'))
      expect(res.status).toBe(200)
      expect(startRun).toHaveBeenCalledTimes(1)
      await res.body?.cancel()
    })

    it('returns 400 rounds_exceeded above the demo cap', async () => {
      authed()
      limits({ demoMode: true, maxRounds: 3 })
      const res = await call(userMessage('hi'), { runOptions: { maxRounds: 5 } })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'rounds_exceeded', max: 3 })
      expect(startRun).not.toHaveBeenCalled()
    })

    it('does not check quota outside demo mode and allows 40 rounds', async () => {
      authed()
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
      const res = await call(userMessage('hi'), { runOptions: { maxRounds: 40 } })
      expect(res.status).toBe(200)
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ maxRounds: 40 }))
      expect(runsStartedSince).not.toHaveBeenCalled()
      await res.body?.cancel()
    })

    const perUserLimits = () =>
      vi.mocked(getLimits).mockImplementation((user) => ({
        demoMode: true,
        paused: false,
        maxRunsPerDay: user.isAnonymous ? 1 : 3,
        signedInMaxRunsPerDay: 3,
        anonymous: user.isAnonymous,
        maxRounds: 3,
        allowPause: false,
      }))
    const startable = () => {
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
    }

    it('gives an anonymous user one run, then 429 quota_exceeded', async () => {
      authed()
      perUserLimits()
      startable()
      const user = sessionUser({ isAnonymous: true })
      vi.mocked(getSessionUser).mockResolvedValue(user)
      const first = await call(userMessage('hi'))
      expect(first.status).toBe(200)
      await first.body?.cancel()
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 1, oldestQueuedAt: new Date(Date.now() - 60_000) })
      const second = await call(userMessage('again'))
      expect(second.status).toBe(429)
      expect(await second.json()).toMatchObject({ error: 'quota_exceeded' })
      expect(getLimits).toHaveBeenCalledWith(user)
      expect(checkRunPolicy).toHaveBeenLastCalledWith(expect.objectContaining({ maxRunsPerDay: 1, runsInWindow: 1 }))
      expect(startRun).toHaveBeenCalledTimes(1)
    })

    it('gives a registered user three runs', async () => {
      authed()
      perUserLimits()
      startable()
      const user = sessionUser({ id: 'real1', isAnonymous: false })
      vi.mocked(getSessionUser).mockResolvedValue(user)
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 2, oldestQueuedAt: new Date(Date.now() - 60_000) })
      const third = await call(userMessage('hi'))
      expect(third.status).toBe(200)
      await third.body?.cancel()
      expect(getLimits).toHaveBeenCalledWith(user)
      expect(runsStartedSince).toHaveBeenCalledWith('real1', expect.any(Date))
      expect(checkRunPolicy).toHaveBeenLastCalledWith(expect.objectContaining({ maxRunsPerDay: 3, runsInWindow: 2 }))
      vi.mocked(runsStartedSince).mockResolvedValue({ count: 3, oldestQueuedAt: new Date(Date.now() - 60_000) })
      const fourth = await call(userMessage('again'))
      expect(fourth.status).toBe(429)
      expect(await fourth.json()).toMatchObject({ error: 'quota_exceeded' })
    })

    it('passes a queuePosition reader for the started run to the tail', async () => {
      authed()
      vi.mocked(startRun).mockResolvedValue({ run: { id: 'r2' }, assistantMessageId: 'a1' } as never)
      vi.mocked(runStore.queuePosition).mockResolvedValue(2)
      vi.mocked(tailRunAsUIMessageStream).mockReturnValue(createUIMessageStream({ execute: () => {} }))
      const res = await call(userMessage('hi'))
      await res.body?.cancel()
      const reader = vi.mocked(tailRunAsUIMessageStream).mock.calls[0]![0].queuePosition!
      expect(await reader()).toBe(2)
      expect(runStore.queuePosition).toHaveBeenCalledWith('r2')
    })
  })
})
