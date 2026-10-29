import { describe, expect, it, vi } from 'vitest'
import { requestReadiness } from './readiness'

const draft = { background: 'Prices rose', actors: 'Pro customers', change: 'A new fee' }

describe('requestReadiness', () => {
  it('posts the brief to the readiness endpoint and returns the answer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ready: false, draft }))
    const result = await requestReadiness('c1', { text: 'why?', uploadIds: ['u1'] }, fetchImpl)
    expect(result).toEqual({ ok: true, readiness: { ready: false, draft } })
    expect(fetchImpl).toHaveBeenCalledWith('/api/chats/c1/readiness', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'why?', uploadIds: ['u1'] }),
    })
  })

  it('sends a retry body as is', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ready: true }))
    expect(await requestReadiness('c1', { retry: true }, fetchImpl)).toEqual({ ok: true, readiness: { ready: true } })
    expect(fetchImpl.mock.calls[0]).toMatchObject([
      '/api/chats/c1/readiness',
      { body: JSON.stringify({ retry: true }) },
    ])
  })

  it('treats a network failure as ready', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual({
      ok: true,
      readiness: { ready: true },
    })
  })

  it.each([500, 502, 503])('treats a %s as ready', async (status) => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 'boom' }, { status }))
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual({
      ok: true,
      readiness: { ready: true },
    })
  })

  it('treats an unreadable success as ready', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope'))
    expect(await requestReadiness('c1', { text: 'why?', uploadIds: [] }, fetchImpl)).toEqual({
      ok: true,
      readiness: { ready: true },
    })
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
