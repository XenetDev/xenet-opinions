import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const run = await runStore.getActiveByChat(chatId)
  if (run?.stage !== 'interviews') return Response.json({ error: 'run_not_paused' }, { status: 409 })
  await runStore.update(run.id, { cursors: { reportRequested: true } })
  return Response.json({ ok: true }, { status: 202 })
}
