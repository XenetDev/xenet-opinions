import { buildSeedDocument, tailRunAsUIMessageStream } from '@xo/engine'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { isChatId } from '@/lib/chat-id'
import { getSessionUser } from '@/lib/session'
import { ensureOwnedChat, getOwnedChat } from '@/server/chats'
import { FollowUpError, runFollowUp } from '@/server/follow-up'
import { createInterviewQuestion, InterviewWindowError } from '@/server/interview-window'
import { messageText, parseMessageBody } from '@/server/message-body'
import { checkRunGate } from '@/server/run-gate'
import { countOwnedUploads, RunActiveError, runStore, startRun } from '@/server/runs'
import { createSeedUpload } from '@/server/uploads'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request.headers)
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: chatId } = await params
  const owned = await getOwnedChat(chatId, user.id)
  if (!owned && !isChatId(chatId)) return Response.json({ error: 'not_found' }, { status: 404 })

  const json = await request.json().catch(() => null)
  const body = parseMessageBody(json)
  if (!body) return Response.json({ error: 'invalid_body' }, { status: 400 })

  const text = messageText(body)
  if (!text) return Response.json({ error: 'empty_message' }, { status: 400 })

  const active = owned ? await runStore.getActiveByChat(chatId) : null
  if (active?.stage === 'interviews') {
    if (body.target !== 'agents') return Response.json({ error: 'run_paused' }, { status: 409 })
    try {
      return Response.json(await createInterviewQuestion({ run: active, agentIds: body.agentIds, text }), {
        status: 202,
      })
    } catch (e) {
      if (e instanceof InterviewWindowError)
        return Response.json({ error: e.code }, { status: e.code === 'invalid_body' ? 400 : 409 })
      throw e
    }
  }
  if (active) return Response.json({ error: 'run_active' }, { status: 409 })
  const latest = owned ? await runStore.getLatestByChat(chatId) : null
  if (owned && latest?.status === 'done') {
    try {
      return await runFollowUp({
        chat: owned,
        run: latest,
        userMessage: { id: body.message.id, parts: body.message.parts },
        text,
        target: body.target,
        agentIds: body.agentIds,
      })
    } catch (e) {
      if (e instanceof FollowUpError)
        return Response.json({ error: e.code }, { status: e.code === 'invalid_body' ? 400 : 409 })
      throw e
    }
  }

  const uploadIds = [...new Set(body.uploadIds)]

  const gate = await checkRunGate(user, { requestedRounds: body.runOptions.maxRounds })
  if (!gate.ok) return gate.response
  const { limits } = gate

  if (uploadIds.length > 0 && (await countOwnedUploads({ chatId, userId: user.id, uploadIds })) !== uploadIds.length) {
    if (!owned) return Response.json({ error: 'not_found' }, { status: 404 })
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!owned && !(await ensureOwnedChat(chatId, user.id))) return Response.json({ error: 'not_found' }, { status: 404 })
  if (uploadIds.length === 0) {
    const seed = await createSeedUpload({
      chatId,
      userId: user.id,
      document: buildSeedDocument({ question: text, ...body.seed }),
    })
    uploadIds.push(seed.id)
  }

  let started: Awaited<ReturnType<typeof startRun>>
  try {
    started = await startRun({
      chatId,
      userId: user.id,
      message: { id: body.message.id, parts: body.message.parts },
      text,
      uploadIds,
      maxRounds: body.runOptions.maxRounds,
      pauseForInterviews: limits.allowPause && body.runOptions.pauseForInterviews,
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
      queuePosition: () => runStore.queuePosition(started.run.id),
      pausedAhead: () => runStore.hasPausedRunning(),
    }),
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
}
