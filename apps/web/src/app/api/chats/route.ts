import { getSessionUser } from '@/lib/session'
import { createChat } from '@/server/chats'

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const chat = await createChat(user.id)
  return Response.json({ id: chat.id }, { status: 201 })
}
