import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Research } from '@xo/db'
import { SEED_ACTORS_MAX, SEED_FIELD_MAX } from '@xo/engine'
import type { Panel } from '@xo/engine/policy'
import { generateText, Output } from 'ai'
import { env } from '@/env'
import { fallbackReadiness } from './fallback'
import {
  readinessForcedNote,
  readinessNoDocumentsNote,
  readinessPanelNote,
  readinessResearchSection,
  readinessSchema,
  readinessSystem,
} from './prompt'
import type { Readiness, ReadinessDraft } from './types'

const TIMEOUT_MS = 8000
const PANEL_TIMEOUT_MS = 45_000
const EMPTY_DRAFT: ReadinessDraft = { background: '', actors: '', change: '' }

type Input = {
  text: string
  documents: Array<{ filename: string; text: string }>
  force?: boolean
  panel?: Panel
  research?: Research | null
}

function userPrompt(input: Input): string {
  const documents = input.documents.map((doc) => `<document filename="${doc.filename}">\n${doc.text}\n</document>`)
  return [
    ...(input.force ? [readinessForcedNote] : documents.length ? [] : [readinessNoDocumentsNote]),
    ...(input.panel ? [readinessPanelNote(input.panel)] : []),
    `<question>\n${input.text}\n</question>`,
    ...(input.research ? [readinessResearchSection(input.research)] : []),
    ...documents,
  ].join('\n\n')
}

function cleanDraft(draft: ReadinessDraft): ReadinessDraft {
  return {
    background: draft.background.trim().slice(0, SEED_FIELD_MAX),
    actors: draft.actors.trim().slice(0, SEED_ACTORS_MAX),
    change: draft.change.trim().slice(0, SEED_FIELD_MAX),
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('readiness check timed out'))
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function checkReadiness(
  input: Input,
  deps: { generate?: typeof generateText; fetch?: typeof fetch } = {},
): Promise<Readiness> {
  const fallback: Readiness = input.force
    ? { ready: false, draft: EMPTY_DRAFT }
    : fallbackReadiness(input.text, input.documents.length)
  if (!env.LLM_API_KEY) return fallback
  const generate = deps.generate ?? generateText
  try {
    const model = createOpenAICompatible({
      name: 'llm',
      baseURL: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      ...(deps.fetch && { fetch: deps.fetch }),
    })(env.LLM_MODEL_NAME)
    const { output } = await withTimeout(input.panel ? PANEL_TIMEOUT_MS : TIMEOUT_MS, (abortSignal) =>
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
    if (input.documents.length === 0) return draft?.actors ? { ready: true, seed: draft } : fallback
    if (!draft?.actors) return { ready: true }
    if (output.ready) return input.panel ? { ready: true, seed: draft } : { ready: true }
    return { ready: false, draft }
  } catch (error) {
    console.error('readiness check failed', { error })
    return fallback
  }
}
