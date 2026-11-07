import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { WorkerEnv } from './env'

export const summaryModelFromEnv = (env: Pick<WorkerEnv, 'LLM_API_KEY' | 'LLM_BASE_URL' | 'LLM_MODEL_NAME'>) =>
  env.LLM_API_KEY
    ? createOpenAICompatible({ name: 'llm', baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY })(env.LLM_MODEL_NAME)
    : undefined
