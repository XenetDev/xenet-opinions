import type { Readiness } from '@/server/readiness/types'

export type ReadinessResult = { ok: true; readiness: Readiness } | { ok: false; code: string }

const READY: ReadinessResult = { ok: true, readiness: { ready: true } }

export async function requestReadiness(
  chatId: string,
  body: { text: string; uploadIds: string[] } | { retry: true },
  fetchImpl: typeof fetch = fetch,
): Promise<ReadinessResult> {
  let response: Response | undefined
  try {
    response = await fetchImpl(`/api/chats/${chatId}/readiness`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return READY
  }
  if (!response || response.status >= 500) return READY
  const json = (await response.json().catch(() => null)) as (Readiness & { error?: string }) | null
  if (!response.ok) return { ok: false, code: json?.error ?? 'readiness_failed' }
  if (json?.ready === false && json.draft) return { ok: true, readiness: { ready: false, draft: json.draft } }
  return READY
}
