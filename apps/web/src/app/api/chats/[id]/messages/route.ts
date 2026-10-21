import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { tailRunAsUIMessageStream } from '@xo/engine'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { messageText, parseMessageBody } from '@/server/message-body'
import { RunActiveError, countOwnedUploads, runStore, startRun } from '@/server/runs'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const json = await request.json().catch(() => null)
  const body = parseMessageBody(json)
  if (!body) return Response.json({ error: 'invalid_body' }, { status: 400 })

  const text = messageText(body)
  if (!text) return Response.json({ error: 'empty_message' }, { status: 400 })

  if (await runStore.getActiveByChat(chatId)) return Response.json({ error: 'run_active' }, { status: 409 })
  const latest = await runStore.getLatestByChat(chatId)
  if (latest?.status === 'done') return Response.json({ error: 'run_finished' }, { status: 409 })

  const uploadIds = [...new Set(body.uploadIds)]
  if (uploadIds.length > 0 && (await countOwnedUploads({ chatId, userId: user.id, uploadIds })) !== uploadIds.length) {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  let started
  try {
    started = await startRun({
      chatId,
      userId: user.id,
      message: { id: body.message.id, parts: body.message.parts },
      text,
      uploadIds,
      maxRounds: body.runOptions.maxRounds,
    })
  } catch (error) {
    if (error instanceof RunActiveError) return Response.json({ error: 'run_active' }, { status: 409 })
    throw error
  }

  return createUIMessageStreamResponse({
    stream: tailRunAsUIMessageStream({
      store: runStore,
      runId: started.run.id,
      messageId: started.assistantMessageId,
      maxDurationMs: 280_000,
      signal: request.signal,
    }),
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
}
