import type { generateText } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: { LLM_API_KEY: 'key', LLM_BASE_URL: 'https://api.openai.com/v1', LLM_MODEL_NAME: 'gpt-4o-mini' },
}))

import { env } from '@/env'
import { checkReadiness } from './check'
import { readinessSystem } from './prompt'

const input = {
  text: 'Is this a good investment?',
  documents: [{ filename: 'deck.pdf', text: 'Acme raises a seed round for its billing API.' }],
}

function stub(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl)
  return { fn, generate: fn as unknown as typeof generateText }
}

const returning = (output: unknown) => stub(async () => ({ output }))

const shortPrompt = { text: 'Should we raise our Pro plan price?', documents: [] }
const longPrompt = { text: Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '), documents: [] }
const EMPTY_CARD = { ready: false, draft: { background: '', actors: '', change: '' } }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  env.LLM_API_KEY = 'key'
})

describe('checkReadiness', () => {
  it('passes ready through', async () => {
    const { generate } = returning({ ready: true, draft: null })
    expect(await checkReadiness(input, { generate })).toEqual({ ready: true })
  })

  it('passes a draft through', async () => {
    const draft = { background: 'b', actors: 'Seed VCs', change: 'c' }
    const { generate } = returning({ ready: false, draft })
    expect(await checkReadiness(input, { generate })).toEqual({ ready: false, draft })
  })

  it('treats a draft without actors as ready', async () => {
    const { generate } = returning({ ready: false, draft: { background: 'b', actors: '  ', change: 'c' } })
    expect(await checkReadiness(input, { generate })).toEqual({ ready: true })
  })

  it('treats a missing draft as ready', async () => {
    const { generate } = returning({ ready: false, draft: null })
    expect(await checkReadiness(input, { generate })).toEqual({ ready: true })
  })

  it('treats a model error as ready', async () => {
    const { generate } = stub(async () => {
      throw new Error('boom')
    })
    expect(await checkReadiness(input, { generate })).toEqual({ ready: true })
  })

  it('gives up after 8 seconds', async () => {
    vi.useFakeTimers()
    const { generate } = stub(() => new Promise(() => {}))
    const result = checkReadiness(input, { generate })
    await vi.advanceTimersByTimeAsync(8000)
    expect(await result).toEqual({ ready: true })
  })

  it('skips the model when LLM_API_KEY is unset', async () => {
    env.LLM_API_KEY = undefined
    const { fn, generate } = returning({ ready: false, draft: { background: 'b', actors: 'a', change: 'c' } })
    expect(await checkReadiness(input, { generate })).toEqual({ ready: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('opens the unfilled card for a short prompt without documents when the check is off', async () => {
    env.LLM_API_KEY = undefined
    const { fn, generate } = returning({ ready: true, draft: null })
    expect(await checkReadiness(shortPrompt, { generate })).toEqual(EMPTY_CARD)
    expect(await checkReadiness(longPrompt, { generate })).toEqual({ ready: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('opens the unfilled card for a short prompt without documents on a timeout', async () => {
    vi.useFakeTimers()
    const { generate } = stub(() => new Promise(() => {}))
    const short = checkReadiness(shortPrompt, { generate })
    const long = checkReadiness(longPrompt, { generate })
    await vi.advanceTimersByTimeAsync(8000)
    expect(await short).toEqual(EMPTY_CARD)
    expect(await long).toEqual({ ready: true })
  })

  it('opens the unfilled card for a short prompt without documents on a model error', async () => {
    const { generate } = stub(async () => {
      throw new Error('boom')
    })
    expect(await checkReadiness(shortPrompt, { generate })).toEqual(EMPTY_CARD)
    expect(await checkReadiness(longPrompt, { generate })).toEqual({ ready: true })
  })

  it('asks for JSON of the exact shape in the system prompt', () => {
    expect(readinessSystem).toContain('JSON')
    for (const field of ['"ready"', '"draft"', '"background"', '"actors"', '"change"'])
      expect(readinessSystem).toContain(field)
  })

  it('asks the real provider for JSON and parses its answer', async () => {
    const draft = { background: 'Acme sells a billing API.', actors: '- Seed VCs\n- Finance teams', change: 'A round' }
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      Response.json({
        id: 'c1',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify({ ready: false, draft }) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', false)
    expect(await checkReadiness(input, { fetch: fetchImpl as unknown as typeof fetch })).toEqual({
      ready: false,
      draft,
    })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions')
    const body = JSON.parse(String(init?.body)) as { response_format: unknown; messages: Array<{ content: unknown }> }
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(JSON.stringify(body.messages).toLowerCase()).toContain('json')
  })

  it('cuts each draft field to 2000 characters', async () => {
    const long = 'x'.repeat(2500)
    const { generate } = returning({ ready: false, draft: { background: long, actors: long, change: long } })
    const result = await checkReadiness(input, { generate })
    expect(result.ready).toBe(false)
    if (result.ready) return
    expect([result.draft.background, result.draft.actors, result.draft.change].map((v) => v.length)).toEqual([
      2000, 2000, 2000,
    ])
  })

  it('returns an empty draft when forced and the model fails', async () => {
    const { generate } = stub(async () => {
      throw new Error('boom')
    })
    expect(await checkReadiness({ ...input, force: true }, { generate })).toEqual({
      ready: false,
      draft: { background: '', actors: '', change: '' },
    })
  })

  it('returns the draft when forced even if the model says ready', async () => {
    const draft = { background: 'b', actors: 'Seed VCs', change: 'c' }
    const { generate } = returning({ ready: true, draft })
    expect(await checkReadiness({ ...input, force: true }, { generate })).toEqual({ ready: false, draft })
  })

  it('sends the question and every document to the model', async () => {
    const { fn, generate } = returning({ ready: true, draft: null })
    await checkReadiness(
      { ...input, documents: [...input.documents, { filename: 'notes.md', text: 'Customers are SMB finance teams.' }] },
      { generate },
    )
    const prompt = (fn.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt
    for (const part of [
      'Is this a good investment?',
      'deck.pdf',
      'Acme raises a seed round for its billing API.',
      'notes.md',
      'Customers are SMB finance teams.',
    ])
      expect(prompt).toContain(part)
  })

  it('runs a prompt-only question with the drafted seed instead of a card', async () => {
    const draft = { background: 'b', actors: '- Pro customers: Maria Lopez, design studio owner', change: 'c' }
    const { fn, generate } = returning({ ready: false, draft })
    expect(await checkReadiness(shortPrompt, { generate })).toEqual({ ready: true, seed: draft })
    const prompt = (fn.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt
    expect(prompt).toContain('There are no documents')
  })

  it('runs a prompt-only question with the seed even when the model says ready', async () => {
    const draft = { background: 'b', actors: '- Commuters: Ana Silva, nurse', change: 'c' }
    const { generate } = returning({ ready: true, draft })
    expect(await checkReadiness(longPrompt, { generate })).toEqual({ ready: true, seed: draft })
  })

  it('falls back when a prompt-only draft has no actors', async () => {
    const { generate } = returning({ ready: true, draft: null })
    expect(await checkReadiness(shortPrompt, { generate })).toEqual(EMPTY_CARD)
    expect(await checkReadiness(longPrompt, { generate })).toEqual({ ready: true })
  })

  it('asks for named examples in every group', () => {
    expect(readinessSystem).toContain('named examples')
  })
})
