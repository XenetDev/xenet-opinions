import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(() => ({ MIROFISH_URL: 'http://mirofish.internal:5001', HEALTH_CHECK_MIROFISH: '1' }))

vi.mock('@/env', () => ({ env: envMock }))
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }))

import { db } from '@/lib/db'
import { GET } from './route'

const HEALTH_MEMO_MS = 5_000

const fetchMock = vi.fn()
let clock = 0

beforeEach(() => {
  clock += 3_600_000
  vi.useFakeTimers({ now: clock })
  vi.resetAllMocks()
  envMock.HEALTH_CHECK_MIROFISH = '1'
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(db.execute).mockResolvedValue([] as never)
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/health', () => {
  it('returns 200 when db and mirofish are ok', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'ok', mirofish: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith('http://mirofish.internal:5001/health', expect.objectContaining({ signal: expect.any(AbortSignal) }))
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
    fetchMock.mockResolvedValue(new Response('no', { status: 500 }))
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    await GET()
    expect(db.execute).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
