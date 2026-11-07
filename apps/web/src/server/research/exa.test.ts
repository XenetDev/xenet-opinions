import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { EXA_API_KEY: 'exa-key' } }))

import { env } from '@/env'
import { researchQuestion } from './exa'

const result = (i: number, over: Record<string, unknown> = {}) => ({
  id: `r${i}`,
  url: `https://example.com/${i}`,
  title: `Title ${i}`,
  publishedDate: '2026-10-01T00:00:00.000Z',
  text: `Body   of\n\nresult ${i}.`,
  ...over,
})

const replying = (body: unknown, status = 200) =>
  vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json(body, { status }))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  env.EXA_API_KEY = 'exa-key'
})

describe('researchQuestion', () => {
  it('searches Exa with the key header and maps the results', async () => {
    const fetchImpl = replying({ results: [result(1), result(2, { title: null, publishedDate: undefined })] })
    const research = await researchQuestion('  Should Toyota raise\nprices?  ', {
      fetch: fetchImpl as unknown as typeof fetch,
    })
    expect(research).toEqual({
      query: 'Should Toyota raise prices?',
      digest: expect.stringContaining('Title 1'),
      sources: [
        {
          title: 'Title 1',
          url: 'https://example.com/1',
          excerpt: 'Body of result 1.',
          publishedAt: '2026-10-01T00:00:00.000Z',
        },
        { title: 'https://example.com/2', url: 'https://example.com/2', excerpt: 'Body of result 2.' },
      ],
    })
    expect(research?.digest).toContain('Body of result 2.')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.exa.ai/search')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('x-api-key')).toBe('exa-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: 'Should Toyota raise prices?',
      numResults: 8,
      contents: { text: { maxCharacters: expect.any(Number) } },
    })
  })

  it('keeps at most 8 sources', async () => {
    const fetchImpl = replying({ results: Array.from({ length: 12 }, (_, i) => result(i)) })
    const research = await researchQuestion('q', { fetch: fetchImpl as unknown as typeof fetch })
    expect(research?.sources).toHaveLength(8)
  })

  it('returns null on a 500', async () => {
    const fetchImpl = replying({ error: 'boom' }, 500)
    expect(await researchQuestion('q', { fetch: fetchImpl as unknown as typeof fetch })).toBeNull()
  })

  it('returns null on an unexpected body or no results', async () => {
    for (const body of [{ nope: true }, { results: [] }]) {
      const fetchImpl = replying(body)
      expect(await researchQuestion('q', { fetch: fetchImpl as unknown as typeof fetch })).toBeNull()
    }
  })

  it('gives up after 12 seconds', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}))
    const research = researchQuestion('q', { fetch: fetchImpl as unknown as typeof fetch })
    await vi.advanceTimersByTimeAsync(12_000)
    expect(await research).toBeNull()
  })

  it('stops when the caller aborts', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const research = researchQuestion('q', { fetch: fetchImpl as unknown as typeof fetch, signal: controller.signal })
    controller.abort()
    expect(await research).toBeNull()
  })

  it('does not call Exa without a key', async () => {
    env.EXA_API_KEY = undefined
    const fetchImpl = replying({ results: [result(1)] })
    expect(await researchQuestion('q', { fetch: fetchImpl as unknown as typeof fetch })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
