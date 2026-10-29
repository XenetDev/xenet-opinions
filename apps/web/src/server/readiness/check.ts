import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { SEED_FIELD_MAX } from '@xo/engine'
import { generateText, Output } from 'ai'
import { env } from '@/env'
import { readinessForcedNote, readinessSchema, readinessSystem } from './prompt'
import type { Readiness, ReadinessDraft } from './types'

const TIMEOUT_MS = 8000
const EMPTY_DRAFT: ReadinessDraft = { background: '', actors: '', change: '' }

type Input = { text: string; documents: Array<{ filename: string; text: string }>; force?: boolean }

function userPrompt(input: Input): string {
  const documents = input.documents.map((doc) => `<document filename="${doc.filename}">\n${doc.text}\n</document>`)
  return [
    ...(input.force ? [readinessForcedNote] : []),
    `<question>\n${input.text}\n</question>`,
    ...(documents.length ? documents : ['No documents were uploaded.']),
  ].join('\n\n')
}

function cleanDraft(draft: ReadinessDraft): ReadinessDraft {
  return {
    background: draft.background.trim().slice(0, SEED_FIELD_MAX),
    actors: draft.actors.trim().slice(0, SEED_FIELD_MAX),
    change: draft.change.trim().slice(0, SEED_FIELD_MAX),
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('readiness check timed out'))
    }, TIMEOUT_MS)
  })
  try {
    return await Promise.race([run(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function checkReadiness(input: Input, deps: { generate?: typeof generateText } = {}): Promise<Readiness> {
  const fallback: Readiness = input.force ? { ready: false, draft: EMPTY_DRAFT } : { ready: true }
  if (!env.LLM_API_KEY) return fallback
  const generate = deps.generate ?? generateText
  try {
    const model = createOpenAICompatible({ name: 'llm', baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY })(
      env.LLM_MODEL_NAME,
    )
    const { output } = await withTimeout((abortSignal) =>
      generate({
        model,
        system: readinessSystem,
        prompt: userPrompt(input),
        output: Output.object({ schema: readinessSchema }),
        abortSignal,
      }),
    )
    const draft = output.draft && cleanDraft(output.draft)
    if (input.force) return { ready: false, draft: draft ?? EMPTY_DRAFT }
    if (output.ready || !draft?.actors) return { ready: true }
    return { ready: false, draft }
  } catch (error) {
    console.error('readiness check failed', { error })
    return fallback
  }
}
