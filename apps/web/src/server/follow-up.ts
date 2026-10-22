import { eq, sql } from 'drizzle-orm'
import { UI_MESSAGE_STREAM_HEADERS, createUIMessageStream, createUIMessageStreamResponse, generateId, type UIMessageStreamWriter } from 'ai'
import { schema, type Chat, type Run } from '@xo/db'
import {
  AgentsDataSchema,
  MAX_INTERVIEW_AGENTS,
  buildChatHistory,
  extendKeepalive,
  interviewPartId,
  interviewsToParts,
  mirofishAgentId,
  pendingInterviewParts,
  type InterviewData,
  type OpinionsUIMessage,
  type RequestedInterview,
} from '@xo/engine'
import { MiroFishError, type MiroFishClient } from '@xo/mirofish'
import { db } from '@/lib/db'
import { mirofish as defaultMirofish } from '@/lib/mirofish'
import { getMessage, listMessages, updateMessageParts } from './chats'
import { runStore } from './runs'

const { chats, interviews, messages } = schema

export type FollowUpErrorCode = 'env_closed' | 'invalid_body' | 'follow_up_unavailable'

export class FollowUpError extends Error {
  code: FollowUpErrorCode

  constructor(code: FollowUpErrorCode) {
    super(code)
    this.name = 'FollowUpError'
    this.code = code
  }
}

type UserMessage = { id: string; parts: unknown[] }
type Writer = UIMessageStreamWriter<OpinionsUIMessage>

export async function loadRoster(run: Pick<Run, 'assistantMessageId'>): Promise<Array<{ id: string; name: string }>> {
  const message = await getMessage(run.assistantMessageId)
  const part = message?.parts.findLast((p) => (p as { type?: unknown } | null)?.type === 'data-agents') as { data?: unknown } | undefined
  const parsed = AgentsDataSchema.safeParse(part?.data)
  return parsed.success ? parsed.data.profiles.map(({ id, name }) => ({ id, name })) : []
}

export async function createFollowUpTurn(input: { chatId: string; userMessage: UserMessage }): Promise<{ assistantMessageId: string }> {
  const assistantMessageId = generateId()
  await db.transaction(async (tx) => {
    await tx
      .insert(messages)
      .values({ id: input.userMessage.id, chatId: input.chatId, role: 'user', parts: input.userMessage.parts })
      .onConflictDoNothing()
    await tx.insert(messages).values({
      id: assistantMessageId,
      chatId: input.chatId,
      role: 'assistant',
      parts: [],
      createdAt: sql`now() + interval '1 millisecond'`,
    })
    await tx.update(chats).set({ updatedAt: sql`now()` }).where(eq(chats.id, input.chatId))
  })
  return { assistantMessageId }
}

async function requestedInterviews(run: Run, agentIds: string[], question: string): Promise<RequestedInterview[]> {
  if (agentIds.length === 0 || agentIds.length > MAX_INTERVIEW_AGENTS || new Set(agentIds).size !== agentIds.length) {
    throw new FollowUpError('invalid_body')
  }
  const names = new Map((await loadRoster(run)).map((agent) => [agent.id, agent.name]))
  return agentIds.map((agentId) => {
    const agentName = names.get(agentId)
    if (agentName === undefined) throw new FollowUpError('invalid_body')
    return { agentId, agentName, question }
  })
}

const interviewError = (error: unknown) => {
  if (error instanceof MiroFishError && (error.code === 'api' || error.code === 'http')) return 'Agents are offline'
  if (error instanceof MiroFishError && error.code === 'timeout') return 'No answer in time'
  return 'Interview failed'
}

const interviewPart = (data: InterviewData) => ({ type: 'data-interview' as const, id: interviewPartId(data.agentId), data })

const respond = (assistantMessageId: string, execute: (writer: Writer) => Promise<void>) =>
  createUIMessageStreamResponse({
    stream: createUIMessageStream<OpinionsUIMessage>({
      async execute({ writer }) {
        writer.write({ type: 'start', messageId: assistantMessageId })
        await execute(writer)
      },
      onError: () => 'follow_up_failed',
    }),
    headers: UI_MESSAGE_STREAM_HEADERS,
  })

export async function runFollowUp(input: {
  chat: Chat
  run: Run
  userMessage: UserMessage
  text: string
  target: 'report' | 'agents'
  agentIds: string[]
  now?: () => Date
  mirofish?: MiroFishClient
}): Promise<Response> {
  const { chat, run, userMessage, text } = input
  const client = input.mirofish ?? defaultMirofish
  const simulationId = run.ids.simulationId
  if (!simulationId) throw new FollowUpError('follow_up_unavailable')

  if (input.target === 'report') {
    const { assistantMessageId } = await createFollowUpTurn({ chatId: chat.id, userMessage })
    return respond(assistantMessageId, async (writer) => {
      let reply: string
      try {
        const rows = await listMessages(chat.id)
        const history = buildChatHistory(rows, { afterMessageId: run.assistantMessageId, excludeMessageId: userMessage.id })
        const result = await client.report.chat({
          simulationId,
          message: text,
          history: history as Array<{ role: 'user' | 'assistant'; content: string }>,
        })
        reply = result.response
      } catch (error) {
        console.error('report chat failed', { runId: run.id, error })
        await db.delete(messages).where(eq(messages.id, assistantMessageId))
        writer.write({ type: 'error', errorText: 'follow_up_failed' })
        return
      }
      await updateMessageParts(assistantMessageId, [{ type: 'text', text: reply, state: 'done' }])
      writer.write({ type: 'text-start', id: 'reply' })
      writer.write({ type: 'text-delta', id: 'reply', delta: reply })
      writer.write({ type: 'text-end', id: 'reply' })
      writer.write({ type: 'finish' })
    })
  }

  if (run.envState !== 'open') throw new FollowUpError('env_closed')
  const requested = await requestedInterviews(run, input.agentIds, text)
  const { assistantMessageId } = await createFollowUpTurn({ chatId: chat.id, userMessage })
  await runStore.update(run.id, { envKeepaliveUntil: extendKeepalive(run, (input.now ?? (() => new Date()))()) })

  return respond(assistantMessageId, async (writer) => {
    for (const data of pendingInterviewParts(requested)) writer.write(interviewPart(data))
    let results: InterviewData[]
    try {
      const result = await client.simulation.interviewBatch({
        simulationId,
        interviews: requested.map((r) => ({ agentId: mirofishAgentId(r.agentId), prompt: text })),
      })
      results = interviewsToParts(result, requested)
    } catch (error) {
      console.error('interview batch failed', { runId: run.id, error })
      const message = interviewError(error)
      results = requested.map((r) => ({ ...r, status: 'failed', error: message }))
    }
    const parts = results.map(interviewPart)
    await db.transaction(async (tx) => {
      await tx.update(messages).set({ parts }).where(eq(messages.id, assistantMessageId))
      await tx.insert(interviews).values(
        results.map((r) => ({
          id: generateId(),
          chatId: chat.id,
          runId: run.id,
          messageId: assistantMessageId,
          agentId: r.agentId,
          agentName: r.agentName,
          question: r.question,
          answer: r.answer ?? null,
          status: r.status,
        })),
      )
    })
    for (const part of parts) writer.write(part)
    writer.write({ type: 'finish' })
  })
}
