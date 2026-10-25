import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { getLimits } from '@/server/limits'
import { retryRun } from '@/server/retry'
import { RunActiveError, RunNotFailedError, runStore } from '@/server/runs'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })
  if (getLimits().paused) return Response.json({ error: 'demo_paused' }, { status: 409 })

  if (await runStore.getActiveByChat(chatId)) return Response.json({ error: 'run_active' }, { status: 409 })
  const latest = await runStore.getLatestByChat(chatId)
  if (latest?.status !== 'failed') return Response.json({ error: 'run_not_failed' }, { status: 409 })

  try {
    const { run, assistantMessageId } = await retryRun({ chatId, userId: user.id })
    return Response.json({ runId: run.id, assistantMessageId }, { status: 201 })
  } catch (error) {
    if (error instanceof RunActiveError) return Response.json({ error: 'run_active' }, { status: 409 })
    if (error instanceof RunNotFailedError) return Response.json({ error: 'run_not_failed' }, { status: 409 })
    throw error
  }
}
