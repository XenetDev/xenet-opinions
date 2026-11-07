import type { generateText } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: { LLM_API_KEY: 'key', LLM_BASE_URL: 'https://api.openai.com/v1', LLM_MODEL_NAME: 'gpt-4.1' },
}))

import { env } from '@/env'
import { allowImprove, improvePrompt, improveSystem } from './improve'

const stub = (impl: () => Promise<unknown>) => {
  const fn = vi.fn(impl)
  return { fn, generate: fn as unknown as typeof generateText }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  env.LLM_API_KEY = 'key'
})

describe('improvePrompt', () => {
  it('returns the trimmed brief and asks for the decision, who is affected and what to learn', async () => {
    const { fn, generate } = stub(async () => ({ text: '  Should we raise prices? Owners and dealers.  ' }))
    expect(await improvePrompt('raise prices?', { generate })).toBe('Should we raise prices? Owners and dealers.')
    const call = fn.mock.calls[0] as unknown as [{ system: string; prompt: string; model: { modelId: string } }]
    expect(call[0].system).toBe(improveSystem)
    expect(improveSystem).toMatch(/decision/i)
    expect(improveSystem).toMatch(/who is affected/i)
    expect(improveSystem).toMatch(/what .* learn/i)
    expect(call[0].prompt).toContain('<question>\nraise prices?\n</question>')
    expect(call[0].model.modelId).toBe('gpt-4.1')
  })

  it('returns null when the model fails or returns nothing', async () => {
    expect(
      await improvePrompt(
        'q',
        stub(async () => Promise.reject(new Error('down'))),
      ),
    ).toBeNull()
    expect(
      await improvePrompt(
        'q',
        stub(async () => ({ text: '   ' })),
      ),
    ).toBeNull()
  })

  it('returns null without an API key', async () => {
    env.LLM_API_KEY = undefined
    const { fn, generate } = stub(async () => ({ text: 'x' }))
    expect(await improvePrompt('q', { generate })).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('allowImprove', () => {
  it('allows 10 a minute per user', () => {
    const start = 5_000_000
    for (let i = 0; i < 10; i++) expect(allowImprove('u1', start + i)).toBe(true)
    expect(allowImprove('u1', start + 10)).toBe(false)
    expect(allowImprove('u2', start + 10)).toBe(true)
    expect(allowImprove('u1', start + 60_000)).toBe(true)
  })
})
