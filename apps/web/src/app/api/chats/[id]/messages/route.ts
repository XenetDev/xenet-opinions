import { checkRunPolicy, QUOTA_WINDOW_MS, tailRunAsUIMessageStream } from '@xo/engine'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { getSessionUser } from '@/lib/session'
import { getOwnedChat } from '@/server/chats'
import { FollowUpError, runFollowUp } from '@/server/follow-up'
import { getLimits } from '@/server/limits'
import { messageText, parseMessageBody } from '@/server/message-body'
import { countOwnedUploads, RunActiveError, runStore, runsStartedSince, startRun } from '@/server/runs'

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
  if (latest?.status === 'done') {
    try {
      return await runFollowUp({
        chat,
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

  const limits = getLimits()
  const now = new Date()
  const window = limits.demoMode
    ? await runsStartedSince(user.id, new Date(now.getTime() - QUOTA_WINDOW_MS))
    : { count: 0, oldestQueuedAt: null }
  const policy = checkRunPolicy({
    demoMode: limits.demoMode,
    paused: limits.paused,
    runsInWindow: window.count,
    maxRunsPerDay: limits.maxRunsPerDay,
    requestedRounds: body.runOptions.maxRounds,
    maxRounds: limits.maxRounds,
    windowStartedAt: window.oldestQueuedAt ?? now,
  })
  if (!policy.ok) {
    if (policy.code === 'demo_paused') return Response.json({ error: 'demo_paused' }, { status: 409 })
    if (policy.code === 'quota_exceeded')
      return Response.json({ error: 'quota_exceeded', resetAt: policy.resetAt?.toISOString() }, { status: 429 })
    return Response.json({ error: 'rounds_exceeded', max: policy.max }, { status: 400 })
  }

  const uploadIds = [...new Set(body.uploadIds)]
  if (uploadIds.length > 0 && (await countOwnedUploads({ chatId, userId: user.id, uploadIds })) !== uploadIds.length) {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
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
    }),
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
}
