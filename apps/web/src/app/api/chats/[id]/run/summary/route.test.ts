import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: {} }))
vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/chats', () => ({ getOwnedChat: vi.fn() }))
vi.mock('@/server/runs', () => ({ runStore: { get: vi.fn(), listEvents: vi.fn(), appendEvent: vi.fn() } }))
vi.mock('@/server/share', () => ({ chatRunId: vi.fn() }))
vi.mock('@/server/summary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/summary')>()),
  summaryModel: vi.fn(),
}))
vi.mock('@xo/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xo/engine')>()),
  summaryEvent: vi.fn(),
  materialiseRun: vi.fn(),
}))

import { materialiseRun, summaryEvent } from '@xo/engine'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'
import { chatRunId } from '@/server/share'
import { summaryModel } from '@/server/summary'
import { sessionUser } from '@/test/session-user'
import { maxDuration, POST } from './route'

const call = (body: unknown = { messageId: 'a1' }) =>
  POST(
    new Request('http://localhost/api/chats/c1/run/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) },
  )

const latest = (run: unknown) => {
  vi.mocked(chatRunId).mockResolvedValue(run ? (run as { id: string }).id : null)
  vi.mocked(runStore.get).mockResolvedValue(run as never)
}

const failure = { kind: 'report_summary_failed', payload: { message: 'x' } }

const owned = () => {
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
  vi.mocked(getOwnedChat).mockResolvedValue({ id: 'c1' } as never)
}

const doneRun = { id: 'r1', status: 'done', config: { requirement: 'q', maxRounds: 3, uploadIds: [] } }
const model = { modelId: 'gpt-4.1' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/chats/[id]/run/summary', () => {
  it('allows the full summary budget', () => {
    expect(maxDuration).toBe(300)
  })

  it('returns 401 json when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 404 for a chat the user does not own', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(sessionUser())
    vi.mocked(getOwnedChat).mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getOwnedChat).toHaveBeenCalledWith('c1', 'user1')
    expect(chatRunId).not.toHaveBeenCalled()
    expect(summaryEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['no run', null],
    ['a running run', { ...doneRun, status: 'running' }],
    ['a failed run', { ...doneRun, status: 'failed' }],
  ])('returns 409 run_not_done for %s', async (_, run) => {
    owned()
    latest(run)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'run_not_done' })
    expect(summaryEvent).not.toHaveBeenCalled()
  })

  it('returns 409 summary_exists when the run already has a summary', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(runStore.listEvents).mockResolvedValue([
      { kind: 'report_summary_failed', payload: { message: 'x' } },
      { kind: 'report_summary', payload: {} },
    ] as never)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'summary_exists' })
    expect(summaryEvent).not.toHaveBeenCalled()
    expect(runStore.appendEvent).not.toHaveBeenCalled()
  })

  it('returns 503 when no summary model is configured', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(undefined)
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'summary_unavailable' })
  })

  it('runs the summary after a failed one, appends the event and re-persists the message parts', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(runStore.listEvents).mockResolvedValue([failure] as never)
    const outcome = { kind: 'report_summary' as const, partId: 'report_summary', payload: { verdict: 'V' } }
    vi.mocked(summaryEvent).mockResolvedValue(outcome)
    const res = await call()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ summary: { verdict: 'V' } })
    expect(summaryEvent).toHaveBeenCalledWith(
      doneRun,
      expect.objectContaining({ store: runStore, summaryModel: model }),
      { signal: expect.any(AbortSignal) },
    )
    expect(runStore.appendEvent).toHaveBeenCalledWith('r1', outcome)
    expect(materialiseRun).toHaveBeenCalledWith(runStore, 'r1')
    expect(vi.mocked(runStore.appendEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(materialiseRun).mock.invocationCallOrder[0]!,
    )
  })

  it('records a failed summary and returns 502', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(runStore.listEvents).mockResolvedValue([failure] as never)
    const outcome = {
      kind: 'report_summary_failed' as const,
      partId: 'report_summary_failed',
      payload: { message: 'The summary could not be written' },
    }
    vi.mocked(summaryEvent).mockResolvedValue(outcome)
    const res = await call()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'summary_failed', message: 'The summary could not be written' })
    expect(runStore.appendEvent).toHaveBeenCalledWith('r1', outcome)
    expect(materialiseRun).toHaveBeenCalledWith(runStore, 'r1')
  })

  it('refuses a second retry while one is running', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(runStore.listEvents).mockResolvedValue([failure] as never)
    let finish: (value: never) => void = () => {}
    vi.mocked(summaryEvent).mockReturnValue(new Promise((resolve) => (finish = resolve as never)))
    const first = call()
    await vi.waitFor(() => expect(summaryEvent).toHaveBeenCalled())
    const second = await call()
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'summary_running' })
    finish({ kind: 'report_summary', partId: 'report_summary', payload: {} } as never)
    expect((await first).status).toBe(201)
  })

  it("resolves the card's run by messageId within the chat", async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(runStore.listEvents).mockResolvedValue([failure] as never)
    vi.mocked(summaryEvent).mockResolvedValue({ kind: 'report_summary', partId: 'report_summary', payload: {} })
    await call({ messageId: 'a7' })
    expect(chatRunId).toHaveBeenCalledWith('c1', { messageId: 'a7' })
    expect(runStore.get).toHaveBeenCalledWith('r1')
  })

  it('returns 400 for a malformed body', async () => {
    owned()
    const res = await call('{nope')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_request' })
    expect(chatRunId).not.toHaveBeenCalled()
  })

  it('returns 409 summary_not_failed when the run has no failed summary', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(runStore.listEvents).mockResolvedValue([{ kind: 'report_text', payload: {} }] as never)
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'summary_not_failed' })
    expect(summaryEvent).not.toHaveBeenCalled()
  })

  it('allows a retry after two failures and refuses after three', async () => {
    owned()
    latest(doneRun)
    vi.mocked(summaryModel).mockReturnValue(model as never)
    vi.mocked(summaryEvent).mockResolvedValue({ kind: 'report_summary', partId: 'report_summary', payload: {} })
    vi.mocked(runStore.listEvents).mockResolvedValue([failure, failure] as never)
    expect((await call()).status).toBe(201)
    vi.mocked(runStore.listEvents).mockResolvedValue([failure, failure, failure] as never)
    const res = await call()
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'summary_retry_limit' })
    expect(summaryEvent).toHaveBeenCalledTimes(1)
  })
})
