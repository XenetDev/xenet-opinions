import type { Interview, Run } from '@xo/db'
import { MiroFishError } from '@xo/mirofish'
import { interviewsToParts, mirofishAgentId } from '../../follow-up/interviews'
import {
  ENV_CHECK_INTERVAL_MS,
  INTERVIEW_CLIENT_TIMEOUT_MS,
  INTERVIEW_MIROFISH_TIMEOUT_S,
  INTERVIEW_WINDOW_MS,
} from '../../follow-up/keepalive'
import { AgentsDataSchema, type InterviewData, type InterviewWindowData } from '../../parts'
import { advance, emit, need, running } from '../emit'
import { closeEnvAndWait } from '../env'
import type { Deps, StageHandler } from '../types'

type Outcome = Pick<InterviewData, 'status' | 'answer' | 'error'>
type CloseReason = NonNullable<InterviewWindowData['reason']>

const OFFLINE = 'Agents are offline'

const failureMessage = (err: unknown) => {
  if (err instanceof MiroFishError && (err.code === 'api' || err.code === 'http')) return OFFLINE
  if (err instanceof MiroFishError && err.code === 'timeout') return 'No answer in time'
  return 'Interview failed'
}

const agentsPlatform = async (run: Run, deps: Deps) => {
  const events = await deps.store.listEvents(run.id, 0)
  const agents = events.filter((e) => e.kind === 'agents').at(-1)
  return AgentsDataSchema.safeParse(agents?.payload).data?.platform ?? 'reddit'
}

const requestOf = (row: Interview) => ({
  id: row.id,
  questionId: row.questionId ?? row.id,
  agentId: row.agentId,
  agentName: row.agentName,
  question: row.question,
})

const settle = async (run: Run, deps: Deps, row: Interview, outcome: Outcome) => {
  await emit(deps, run, 'interview', { ...requestOf(row), ...outcome })
  await deps.store.updateInterview(row.id, {
    status: outcome.status,
    ...(outcome.answer !== undefined ? { answer: outcome.answer } : {}),
  })
}

const interviewOne = async (run: Run, deps: Deps, row: Interview): Promise<Outcome> => {
  try {
    const result = await deps.mirofish.simulation.interviewBatch(
      {
        simulationId: need(run.ids.simulationId, 'simulationId'),
        interviews: [{ agentId: mirofishAgentId(row.agentId), prompt: row.question }],
        platform: await agentsPlatform(run, deps),
        timeout: INTERVIEW_MIROFISH_TIMEOUT_S,
      },
      { timeoutMs: INTERVIEW_CLIENT_TIMEOUT_MS },
    )
    const [part] = interviewsToParts(result, [requestOf(row)])
    return part?.status === 'done' ? { status: 'done', answer: part.answer } : { status: 'failed', error: part?.error }
  } catch (err) {
    deps.log('interview failed', { runId: run.id, interviewId: row.id, error: err })
    return { status: 'failed', error: failureMessage(err) }
  }
}

const closeWindow = async (run: Run, deps: Deps, reason: CloseReason) => {
  for (const row of await deps.store.listPendingInterviews(run.id)) {
    await settle(run, deps, row, { status: 'failed', error: OFFLINE })
  }
  await emit(deps, run, 'interview_window', {
    until: null,
    personaCount: run.cursors.lastAgentCount ?? 0,
    closed: true,
    reason,
  })
  const closed = await deps.store.update(run.id, { envState: 'closed', envKeepaliveUntil: null }, deps.fence)
  return advance(deps, closed, 'interviews', 'report')
}

export const interviews: StageHandler = {
  stage: 'interviews',
  hasEntered: (run) => Boolean(run.cursors.interviewsStartedAt),
  async enter(run, deps) {
    const now = deps.now()
    const until = new Date(now.getTime() + (deps.envKeepaliveMs ?? INTERVIEW_WINDOW_MS))
    const entered = await deps.store.update(
      run.id,
      { envState: 'open', envKeepaliveUntil: until, cursors: { interviewsStartedAt: now.toISOString() } },
      deps.fence,
    )
    await running(deps, entered, 'interviews', { message: 'Personas online' })
    await emit(deps, entered, 'interview_window', {
      until: until.toISOString(),
      personaCount: entered.cursors.lastAgentCount ?? 0,
      closed: false,
    })
    return entered
  },
  async poll(stale, deps) {
    const run = (await deps.store.get(stale.id)) ?? stale
    const now = deps.now()
    if (!run.cursors.envCloseRequested) {
      const [row] = await deps.store.listPendingInterviews(run.id)
      if (row) {
        await settle(run, deps, row, await interviewOne(run, deps, row))
        return run
      }
    }
    const expired = !run.envKeepaliveUntil || run.envKeepaliveUntil.getTime() <= now.getTime()
    if (run.cursors.reportRequested || expired || run.cursors.envCloseRequested) {
      const closing = await closeEnvAndWait(run, deps)
      if (!closing.closed) return closing.run
      return closeWindow(closing.run, deps, run.cursors.reportRequested ? 'report_requested' : 'expired')
    }
    const lastCheck = Date.parse(
      need(run.cursors.envCheckedAt ?? run.cursors.interviewsStartedAt, 'interviewsStartedAt'),
    )
    if (now.getTime() - lastCheck < ENV_CHECK_INTERVAL_MS) return run
    const status = await deps.mirofish.simulation.runStatus(need(run.ids.simulationId, 'simulationId'))
    if (status.runner_status === 'running' || status.runner_status === 'paused') {
      return deps.store.update(run.id, { cursors: { envCheckedAt: now.toISOString() } }, deps.fence)
    }
    return closeWindow(run, deps, 'environment_stopped')
  },
}
