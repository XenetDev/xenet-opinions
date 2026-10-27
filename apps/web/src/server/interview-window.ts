import type { Run } from '@xo/db'
import { extendInterviewWindow, MAX_INTERVIEW_AGENTS, partIdFor, type RunEventInput } from '@xo/engine'
import { generateId } from 'ai'
import { loadRoster } from './roster'
import { runStore } from './runs'

export type InterviewWindowErrorCode = 'invalid_body' | 'report_requested' | 'window_closed'

export class InterviewWindowError extends Error {
  code: InterviewWindowErrorCode

  constructor(code: InterviewWindowErrorCode) {
    super(code)
    this.name = 'InterviewWindowError'
    this.code = code
  }
}

const windowOpen = (run: Run, now: Date) =>
  run.stage === 'interviews' &&
  run.envState === 'open' &&
  !run.cursors.reportRequested &&
  !run.cursors.envCloseRequested &&
  (run.envKeepaliveUntil?.getTime() ?? 0) > now.getTime()

export async function createInterviewQuestion(input: {
  run: Run
  agentIds: string[]
  text: string
  now?: Date
}): Promise<{ questionId: string; interviewIds: string[] }> {
  const { run, agentIds, text } = input
  const now = input.now ?? new Date()
  if (agentIds.length === 0 || agentIds.length > MAX_INTERVIEW_AGENTS || new Set(agentIds).size !== agentIds.length) {
    throw new InterviewWindowError('invalid_body')
  }
  const names = new Map((await loadRoster(run)).map((agent) => [agent.id, agent.name]))
  if (agentIds.some((id) => !names.has(id))) throw new InterviewWindowError('invalid_body')
  if (run.cursors.reportRequested) throw new InterviewWindowError('report_requested')
  if (!run.envKeepaliveUntil || run.envKeepaliveUntil.getTime() <= now.getTime()) {
    throw new InterviewWindowError('window_closed')
  }

  const questionId = generateId()
  const rows = await runStore.createInterviews(
    agentIds.map((agentId) => ({
      id: generateId(),
      questionId,
      chatId: run.chatId,
      runId: run.id,
      messageId: run.assistantMessageId,
      agentId,
      agentName: names.get(agentId)!,
      question: text,
      status: 'pending',
    })),
  )
  const events: RunEventInput[] = rows.map((row) => {
    const payload = {
      id: row.id,
      questionId,
      agentId: row.agentId,
      agentName: row.agentName,
      question: row.question,
      status: 'pending' as const,
    }
    return { kind: 'interview', partId: partIdFor('interview', payload), payload }
  })
  let locked = undefined as Run | undefined
  try {
    await runStore.transition(
      run.id,
      (current) => ({ envKeepaliveUntil: extendInterviewWindow(current, rows.length, now) }),
      events,
      undefined,
      {
        expect: (current) => {
          locked = current
          return windowOpen(current, now)
        },
      },
    )
  } catch (error) {
    if (!(error instanceof Error && error.message === 'run_not_active')) throw error
    for (const row of rows) await runStore.updateInterview(row.id, { status: 'failed' })
    throw new InterviewWindowError(locked?.cursors.reportRequested ? 'report_requested' : 'window_closed')
  }
  return { questionId, interviewIds: rows.map((row) => row.id) }
}
