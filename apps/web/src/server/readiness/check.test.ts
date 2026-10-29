import type { generateText } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: { LLM_API_KEY: 'key', LLM_BASE_URL: 'https://api.openai.com/v1', LLM_MODEL_NAME: 'gpt-4o-mini' },
}))

import { env } from '@/env'
import { checkReadiness } from './check'

const input = {
  text: 'Is this a good investment?',
  documents: [{ filename: 'deck.pdf', text: 'Acme raises a seed round for its billing API.' }],
}

function stub(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl)
  return { fn, generate: fn as unknown as typeof generateText }
}

const returning = (output: unknown) => stub(async () => ({ output }))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
})
