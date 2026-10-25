import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(() => ({
  MIROFISH_URL: 'http://mirofish.internal:5001',
  MIROFISH_TOKEN: 'secret' as string | undefined,
  HEALTH_CHECK_MIROFISH: '1',
}))

vi.mock('@/env', () => ({ env: envMock }))
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }))

import { db } from '@/lib/db'
import { GET } from './route'

const HEALTH_MEMO_MS = 5_000
const HEALTH_URL = 'http://mirofish.internal:5001/health'
const PROBE_URL = 'http://mirofish.internal:5001/api/graph/task/health-probe'

const fetchMock = vi.fn()
let clock = 0

beforeEach(() => {
  clock += 3_600_000
  vi.useFakeTimers({ now: clock })
  vi.resetAllMocks()
  envMock.HEALTH_CHECK_MIROFISH = '1'
  envMock.MIROFISH_TOKEN = 'secret'
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(db.execute).mockResolvedValue([] as never)
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }))
})

const respond = (health: () => Promise<Response>, probe: () => Promise<Response>) =>
  fetchMock.mockImplementation(async (url: string) => (url === PROBE_URL ? probe() : health()))

const probeHeaders = () => {
  const call = fetchMock.mock.calls.find(([url]) => url === PROBE_URL)
  return new Headers((call?.[1] as RequestInit | undefined)?.headers)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/health', () => {
  it('returns 200 when db and mirofish are ok', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'ok', mirofish: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(fetchMock).toHaveBeenCalledWith(PROBE_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('returns 503 unauthorized when the token probe gets 401', async () => {
    respond(
      async () => new Response('{}', { status: 200 }),
      async () => new Response('no', { status: 401 }),
    )
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, db: 'ok', mirofish: 'unauthorized' })
  })

  it('treats a 404 from the token probe as authorised', async () => {
    respond(
      async () => new Response('{}', { status: 200 }),
      async () => new Response('missing', { status: 404 }),
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'ok', mirofish: 'ok' })
  })

  it('treats a 500 from the token probe as authorised', async () => {
    respond(
      async () => new Response('{}', { status: 200 }),
      async () => new Response('boom', { status: 500 }),
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'ok', mirofish: 'ok' })
  })

  it('returns 503 error when /health rejects even if the probe is authorised', async () => {
    respond(
      async () => Promise.reject(new Error('down')),
      async () => new Response('missing', { status: 404 }),
    )
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, db: 'ok', mirofish: 'error' })
  })

  it('returns 503 error when the token probe rejects', async () => {
    respond(
      async () => new Response('{}', { status: 200 }),
      async () => Promise.reject(new Error('timeout')),
    )
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, db: 'ok', mirofish: 'error' })
  })

  it('sends X-MiroFish-Token on the probe when MIROFISH_TOKEN is set', async () => {
    await GET()
    expect(probeHeaders().get('X-MiroFish-Token')).toBe('secret')
  })

  it('omits X-MiroFish-Token when MIROFISH_TOKEN is unset', async () => {
    envMock.MIROFISH_TOKEN = undefined
    await GET()
    expect(fetchMock.mock.calls.some(([url]) => url === PROBE_URL)).toBe(true)
    expect(probeHeaders().has('X-MiroFish-Token')).toBe(false)
  })

  it('returns 503 without leaking details when mirofish fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED http://mirofish.internal:5001'))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ ok: false, db: 'ok', mirofish: 'error' })
    const text = JSON.stringify(body)
    expect(text).not.toContain('http')
    expect(text).not.toContain('at ')
  })

  it('returns 503 when mirofish responds non-2xx', async () => {
    fetchMock.mockImplementation(async () => new Response('no', { status: 500 }))
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, db: 'ok', mirofish: 'error' })
  })

  it('skips mirofish when HEALTH_CHECK_MIROFISH is 0', async () => {
    envMock.HEALTH_CHECK_MIROFISH = '0'
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'ok', mirofish: 'skipped' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 503 when the db throws', async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error('password authentication failed postgres://u:p@h/d'))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ ok: false, db: 'error', mirofish: 'ok' })
    expect(JSON.stringify(body)).not.toContain('postgres')
  })

  it('sets no-store and memoises the result for HEALTH_MEMO_MS', async () => {
    const first = await GET()
    expect(first.headers.get('cache-control')).toBe('no-store')
    vi.advanceTimersByTime(HEALTH_MEMO_MS - 1)
    const second = await GET()
    expect(second.status).toBe(200)
    expect(second.headers.get('cache-control')).toBe('no-store')
    expect(await second.json()).toEqual({ ok: true, db: 'ok', mirofish: 'ok' })
    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.filter(([url]) => url === HEALTH_URL)).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url]) => url === PROBE_URL)).toHaveLength(1)
    vi.advanceTimersByTime(2)
    await GET()
    expect(db.execute).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
