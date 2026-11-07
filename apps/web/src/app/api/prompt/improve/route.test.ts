import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/server/prompt/improve', () => ({ improvePrompt: vi.fn(), allowImprove: vi.fn() }))

import { getSessionUser } from '@/lib/session'
import { allowImprove, improvePrompt } from '@/server/prompt/improve'
import { sessionUser } from '@/test/session-user'
import { POST } from './route'

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/prompt/improve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset().mockResolvedValue(sessionUser())
  vi.mocked(allowImprove).mockReset().mockReturnValue(true)
  vi.mocked(improvePrompt).mockReset().mockResolvedValue('A brief.')
})

describe('POST /api/prompt/improve', () => {
  it('needs a session', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const response = await call({ text: 'q' })
    expect(response.status).toBe(401)
    expect(improvePrompt).not.toHaveBeenCalled()
  })

  it('returns the improved text for a guest session', async () => {
    const response = await call({ text: '  raise prices? ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: 'A brief.' })
    expect(improvePrompt).toHaveBeenCalledWith('raise prices?')
    expect(allowImprove).toHaveBeenCalledWith('user1')
  })

  it.each([{}, { text: '   ' }, { text: 'x'.repeat(20_001) }])('rejects an invalid body %#', async (body) => {
    expect((await call(body)).status).toBe(400)
  })

  it('rate limits per user', async () => {
    vi.mocked(allowImprove).mockReturnValue(false)
    const response = await call({ text: 'q' })
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate_limited' })
    expect(improvePrompt).not.toHaveBeenCalled()
  })

  it('answers 502 when the rewrite fails', async () => {
    vi.mocked(improvePrompt).mockResolvedValue(null)
    const response = await call({ text: 'q' })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'improve_failed' })
  })
})
