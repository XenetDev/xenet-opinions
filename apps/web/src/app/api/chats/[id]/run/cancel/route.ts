import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { RunNotActiveError, RunNotFoundError, cancelActiveRun } from '@/server/runs'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  try {
    const run = await cancelActiveRun(chatId)
    return Response.json({ runId: run.id })
  } catch (error) {
    if (error instanceof RunNotFoundError) return Response.json({ error: 'not_found' }, { status: 404 })
    if (error instanceof RunNotActiveError) return Response.json({ error: 'run_not_active' }, { status: 409 })
    throw error
  }
}
