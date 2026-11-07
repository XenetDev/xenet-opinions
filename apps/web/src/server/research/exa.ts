import type { Research } from '@xo/db'
import { z } from 'zod'
import { env } from '@/env'

export type { Research } from '@xo/db'

const SEARCH_URL = 'https://api.exa.ai/search'
const TIMEOUT_MS = 12_000
const MAX_SOURCES = 8
const QUERY_MAX = 1000
const EXCERPT_MAX = 800

const responseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string().min(1),
      title: z.string().nullish(),
      text: z.string().nullish(),
      publishedDate: z.string().nullish(),
    }),
  ),
})

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()

async function search(query: string, key: string, fetchImpl: typeof fetch, signal: AbortSignal) {
  const response = await fetchImpl(SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: MAX_SOURCES,
      contents: { text: { maxCharacters: EXCERPT_MAX } },
    }),
    signal,
  })
  if (!response.ok) throw new Error(`exa search failed with ${response.status}`)
  const { results } = responseSchema.parse(await response.json())
  const sources = results.slice(0, MAX_SOURCES).map((result) => ({
    title: collapse(result.title ?? '') || result.url,
    url: result.url,
    excerpt: collapse(result.text ?? '').slice(0, EXCERPT_MAX),
    ...(result.publishedDate && { publishedAt: result.publishedDate }),
  }))
  if (sources.length === 0) return null
  const digest = sources
    .map(
      (source, i) =>
        `[${i + 1}] ${source.title}${source.publishedAt ? ` (${source.publishedAt.slice(0, 10)})` : ''}: ${source.excerpt}`,
    )
    .join('\n\n')
  return { query, digest, sources }
}

export async function researchQuestion(
  question: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Research | null> {
  const key = env.EXA_API_KEY
  const query = collapse(question).slice(0, QUERY_MAX)
  if (!key || !query) return null
  const controller = new AbortController()
  const abort = () => controller.abort()
  opts.signal?.addEventListener('abort', abort)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('web research timed out'))
    }, TIMEOUT_MS)
  })
  try {
    return await Promise.race([search(query, key, opts.fetch ?? fetch, controller.signal), timeout])
  } catch (error) {
    console.error('web research failed', { error })
    return null
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', abort)
  }
}
