import { createUIMessageStreamResponse, generateId, type UIMessage } from 'ai'
import { getSessionUser } from '@/lib/session'
import { appendMessage, getOwnedChat, updateMessageParts } from '@/server/chats'
import { createEchoStream, persistAssistantParts } from '@/server/echo-stream'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const { message } = (await request.json()) as { id: string; message: UIMessage }
  const text = message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()
  if (!text) return Response.json({ error: 'empty_message' }, { status: 400 })

  await appendMessage({ chatId, id: message.id, role: 'user', parts: message.parts })
  const assistantMessageId = generateId()
  await appendMessage({ chatId, id: assistantMessageId, role: 'assistant', parts: [] })

  const [responseBranch, persistBranch] = createEchoStream({ assistantMessageId, text }).tee()
  void persistAssistantParts(persistBranch, assistantMessageId, updateMessageParts).catch((error) =>
    console.error('failed to persist assistant parts', error),
  )

  return createUIMessageStreamResponse({ stream: responseBranch })
}
