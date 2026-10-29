import { fallbackReadiness } from '@/server/readiness/fallback'
import type { Readiness } from '@/server/readiness/types'

export type ReadinessResult = { ok: true; readiness: Readiness } | { ok: false; code: string }

const TIMEOUT_MS = 12_000

export async function requestReadiness(
  chatId: string,
  body: { text: string; uploadIds: string[] } | { retry: true },
  fetchImpl: typeof fetch = fetch,
): Promise<ReadinessResult> {
  const fallback: ReadinessResult = {
    ok: true,
    readiness: 'retry' in body ? { ready: true } : fallbackReadiness(body.text, body.uploadIds.length),
  }
  let response: Response | undefined
  try {
    response = await fetchImpl(`/api/chats/${chatId}/readiness`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return fallback
  }
  if (!response || response.status >= 500) return fallback
  const json = (await response.json().catch(() => null)) as (Readiness & { error?: string }) | null
  if (!response.ok) return { ok: false, code: json?.error ?? 'readiness_failed' }
  if (json?.ready === false && json.draft) return { ok: true, readiness: { ready: false, draft: json.draft } }
  if (json?.ready === true) return { ok: true, readiness: { ready: true } }
  return fallback
}
