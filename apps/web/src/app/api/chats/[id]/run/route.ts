import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const run = await runStore.getLatestByChat(chatId)
  if (!run) return Response.json({ status: 'none' })

  return Response.json({
    runId: run.id,
    status: run.status,
    stage: run.stage,
    assistantMessageId: run.assistantMessageId,
    lastSeq: await runStore.lastSeq(run.id),
    queuePosition: await runStore.queuePosition(run.id),
    envState: run.envState === 'open' || run.envState === 'closed' ? run.envState : 'none',
    envKeepaliveUntil: run.envKeepaliveUntil ? run.envKeepaliveUntil.toISOString() : null,
  })
}
