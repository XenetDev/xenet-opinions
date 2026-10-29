import { describe, expect, it, vi } from 'vitest'
import { requestReadiness } from './readiness'

const draft = { background: 'Prices rose', actors: 'Pro customers', change: 'A new fee' }
const EMPTY_CARD = { ok: true, readiness: { ready: false, draft: { background: '', actors: '', change: '' } } }
const READY = { ok: true, readiness: { ready: true } }
const LONG = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')

describe('requestReadiness', () => {
  it('posts the brief to the readiness endpoint and returns the answer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ready: false, draft }))
    const result = await requestReadiness('c1', { text: 'why?', uploadIds: ['u1'] }, fetchImpl)
    expect(result).toEqual({ ok: true, readiness: { ready: false, draft } })
    expect(fetchImpl).toHaveBeenCalledWith('/api/chats/c1/readiness', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'why?', uploadIds: ['u1'] }),
      signal: expect.any(AbortSignal),
    })
  })

  it('gives up after 12 seconds', async () => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        ),
    )
    const result = requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)
    expect(timeout).toHaveBeenCalledWith(12_000)
    controller.abort(new DOMException('timed out', 'TimeoutError'))
    expect(await result).toEqual(EMPTY_CARD)
    timeout.mockRestore()
  })

  it('sends a retry body as is', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ready: true }))
    expect(await requestReadiness('c1', { retry: true }, fetchImpl)).toEqual({ ok: true, readiness: { ready: true } })
    expect(fetchImpl.mock.calls[0]).toMatchObject([
      '/api/chats/c1/readiness',
      { body: JSON.stringify({ retry: true }) },
    ])
  })

  it('opens the unfilled card on a network failure for a short prompt without documents', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual(EMPTY_CARD)
  })

  it('treats a network failure as ready with documents, a long prompt or a retry', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: ['u1'] }, fetchImpl)).toEqual(READY)
    expect(await requestReadiness('c1', { text: LONG, uploadIds: [] }, fetchImpl)).toEqual(READY)
    expect(await requestReadiness('c1', { retry: true }, fetchImpl)).toEqual(READY)
  })

  it.each([500, 502, 503])('falls back on a %s', async (status) => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 'boom' }, { status }))
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual(EMPTY_CARD)
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: ['u1'] }, fetchImpl)).toEqual(READY)
  })

  it('falls back on an unreadable success', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope'))
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual(EMPTY_CARD)
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: ['u1'] }, fetchImpl)).toEqual(READY)
  })

  it.each([
    [429, 'quota_exceeded'],
    [409, 'demo_paused'],
    [404, 'not_found'],
    [400, 'invalid_body'],
  ])('returns the error code of a %s', async (status, code) => {
    const fetchImpl = vi.fn(async () => Response.json({ error: code }, { status }))
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual({ ok: false, code })
  })

  it('falls back to a generic code when a 4xx has no error field', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual({
      ok: false,
      code: 'readiness_failed',
    })
  })
})
