import { materialiseRun, SUMMARY_BUDGET_MS, summaryEvent } from '@xo/engine'
import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'
import { chatRunId } from '@/server/share'
import { exclusive, SUMMARY_MAX_FAILURES, summaryModel } from '@/server/summary'

export const runtime = 'nodejs'
export const maxDuration = 300

const Body = z.object({ messageId: z.string().min(1).max(64).optional() })

const parseBody = async (request: Request) => {
  const text = await request.text()
  try {
    return Body.safeParse(text ? JSON.parse(text) : {}).data ?? null
  } catch {
    return null
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const body = await parseBody(request)
  if (!body) return Response.json({ error: 'bad_request' }, { status: 400 })

  const runId = await chatRunId(chatId, body.messageId ? { messageId: body.messageId } : {})
  const run = runId ? await runStore.get(runId) : null
  if (run?.status !== 'done') return Response.json({ error: 'run_not_done' }, { status: 409 })
  const model = summaryModel()
  if (!model) return Response.json({ error: 'summary_unavailable' }, { status: 503 })

  const outcome = await exclusive(run.id, async () => {
    const events = await runStore.listEvents(run.id, 0)
    if (events.some((e) => e.kind === 'report_summary')) return 'exists' as const
    const failures = events.filter((e) => e.kind === 'report_summary_failed').length
    if (failures === 0) return 'not_failed' as const
    if (failures >= SUMMARY_MAX_FAILURES) return 'limit' as const
    const result = await summaryEvent(
      run,
      { store: runStore, summaryModel: model, log: (msg, meta) => console.error(msg, meta) },
      { signal: AbortSignal.timeout(SUMMARY_BUDGET_MS) },
    )
    await runStore.appendEvent(run.id, result)
    await materialiseRun(runStore, run.id)
    return result
  })
  if (outcome === null) return Response.json({ error: 'summary_running' }, { status: 409 })
  if (outcome === 'exists') return Response.json({ error: 'summary_exists' }, { status: 409 })
  if (outcome === 'not_failed') return Response.json({ error: 'summary_not_failed' }, { status: 409 })
  if (outcome === 'limit') return Response.json({ error: 'summary_retry_limit' }, { status: 429 })
  if (outcome.kind === 'report_summary') return Response.json({ summary: outcome.payload }, { status: 201 })
  return Response.json({ error: 'summary_failed', ...(outcome.payload as { message: string }) }, { status: 502 })
}
