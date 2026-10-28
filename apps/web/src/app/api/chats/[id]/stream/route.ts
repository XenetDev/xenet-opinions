import { tailRunAsUIMessageStream } from '@xo/engine'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { runStore } from '@/server/runs'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const after = new URL(request.url).searchParams.get('after')
  if (after !== null && !(/^\d+$/.test(after) && Number.isSafeInteger(Number(after))))
    return Response.json({ error: 'invalid_after' }, { status: 400 })

  const { id: chatId } = await params
  const chat = await getOwnedChat(chatId, user.id)
  if (!chat) return Response.json({ error: 'not_found' }, { status: 404 })

  const run =
    (await runStore.getActiveByChat(chatId)) ?? (after === null ? null : await runStore.getLatestByChat(chatId))
  if (!run) return new Response(null, { status: 204 })

  return createUIMessageStreamResponse({
    stream: tailRunAsUIMessageStream({
      store: runStore,
      runId: run.id,
      messageId: run.assistantMessageId,
      afterSeq: after === null ? 0 : Number(after),
      maxDurationMs: 280_000,
      signal: request.signal,
      queuePosition: () => runStore.queuePosition(run.id),
      pausedAhead: () => runStore.hasPausedRunning(),
    }),
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
}
