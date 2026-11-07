import { z } from 'zod'
import { env } from '@/env'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { createShareLink, revokeShareLink, type ShareTarget } from '@/server/share'

export const runtime = 'nodejs'

const Body = z.object({ runId: z.string().min(1).optional(), messageId: z.string().min(1).optional() })

type Ctx = { params: Promise<{ id: string }> }

async function authorise(
  request: Request,
  { params }: Ctx,
): Promise<Response | { chatId: string; target: ShareTarget }> {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })
  const text = await request.text()
  let raw: unknown = {}
  try {
    raw = text ? JSON.parse(text) : {}
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = Body.safeParse(raw)
  if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
  const target: ShareTarget = {
    ...(body.data.runId && { runId: body.data.runId }),
    ...(body.data.messageId && { messageId: body.data.messageId }),
  }
  return { chatId: chat.id, target }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await authorise(request, ctx)
  if (auth instanceof Response) return auth
  const token = await createShareLink(auth.chatId, auth.target)
  if (!token) return Response.json({ error: 'no_summary' }, { status: 409 })
  return Response.json({ token, url: new URL(`/r/${token}`, env.NEXT_PUBLIC_APP_URL).toString() })
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await authorise(request, ctx)
  if (auth instanceof Response) return auth
  const revoked = await revokeShareLink(auth.chatId, auth.target)
  if (!revoked) return Response.json({ error: 'no_summary' }, { status: 409 })
  return Response.json({ revoked: true })
}
