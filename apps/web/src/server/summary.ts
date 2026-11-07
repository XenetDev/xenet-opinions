import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { env } from '@/env'

export function summaryModel(): LanguageModel | undefined {
  if (!env.LLM_API_KEY) return undefined
  return createOpenAICompatible({ name: 'llm', baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY })(env.LLM_MODEL_NAME)
}

export const SUMMARY_MAX_FAILURES = 3

const inFlight = new Set<string>()

export async function exclusive<T>(runId: string, run: () => Promise<T>): Promise<T | null> {
  if (inFlight.has(runId)) return null
  inFlight.add(runId)
  try {
    return await run()
  } finally {
    inFlight.delete(runId)
  }
}
