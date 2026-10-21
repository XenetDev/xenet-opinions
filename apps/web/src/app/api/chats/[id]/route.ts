import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { deleteChat, getOwnedChat, renameChat } from '@/server/chats'

export const runtime = 'nodejs'

const bodySchema = z.object({ title: z.string().trim().min(1).max(120) })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'invalid_body' }, { status: 400 })

  await renameChat(chatId, body.data.title)
  return Response.json({ id: chatId, title: body.data.title })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  await deleteChat(chatId)
  return new Response(null, { status: 204 })
}
