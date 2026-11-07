import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: { LLM_API_KEY: 'key', LLM_BASE_URL: 'https://api.openai.com/v1', LLM_MODEL_NAME: 'gpt-4.1' },
}))

import { env } from '@/env'
import { exclusive, summaryModel } from './summary'

afterEach(() => {
  env.LLM_API_KEY = 'key'
})

describe('summaryModel', () => {
  it('builds the configured model, or none without LLM_API_KEY', () => {
    expect(summaryModel()).toMatchObject({ modelId: 'gpt-4.1' })
    env.LLM_API_KEY = undefined
    expect(summaryModel()).toBeUndefined()
  })
})

describe('exclusive', () => {
  it('runs one job per run id at a time', async () => {
    let release: () => void = () => {}
    const first = exclusive('r1', () => new Promise<string>((resolve) => (release = () => resolve('done'))))
    expect(await exclusive('r1', async () => 'second')).toBeNull()
    expect(await exclusive('r2', async () => 'other')).toBe('other')
    release()
    expect(await first).toBe('done')
    expect(await exclusive('r1', async () => 'again')).toBe('again')
  })
})
