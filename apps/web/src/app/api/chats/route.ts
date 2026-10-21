import { getSessionUser } from '@/lib/session'
import { createChat, listChats } from '@/server/chats'

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const chat = await createChat(user.id)
  return Response.json({ id: chat.id }, { status: 201 })
}

export async function GET(request: Request) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  return Response.json({ chats: await listChats(user.id) })
}
