import { describe, expect, it } from 'vitest'
import { parseWorkerEnv } from './env'
import { summaryModelFromEnv } from './summary-model'

const base = { DATABASE_URL: 'postgres://x', MIROFISH_URL: 'http://m' }

describe('summaryModelFromEnv', () => {
  it('is off without LLM_API_KEY and the LLM settings are optional', () => {
    const env = parseWorkerEnv({ ...base, LLM_API_KEY: '', LLM_BASE_URL: '', LLM_MODEL_NAME: '' })
    expect(env).toMatchObject({ LLM_BASE_URL: 'https://api.openai.com/v1', LLM_MODEL_NAME: 'gpt-4o-mini' })
    expect(env.LLM_API_KEY).toBeUndefined()
    expect(summaryModelFromEnv(env)).toBeUndefined()
  })

  it('builds the configured model with LLM_API_KEY', () => {
    const env = parseWorkerEnv({ ...base, LLM_API_KEY: 'k', LLM_MODEL_NAME: 'gpt-4.1' })
    expect(summaryModelFromEnv(env)).toMatchObject({ modelId: 'gpt-4.1' })
  })
})
